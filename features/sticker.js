const {
  downloadContentFromMessage,
  getContentType,
} = require('@whiskeysockets/baileys');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TMP_DIR = './tmp';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

/**
 * Download media dari pesan WhatsApp
 */
async function downloadMedia(message, mediaType) {
  const stream = await downloadContentFromMessage(message, mediaType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Konversi buffer gambar menjadi stiker WebP
 */
async function imageToSticker(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Handler utama fitur stiker
 * @param {object} sock - WhatsApp socket
 * @param {object} msg - Pesan yang masuk
 * @param {string} jid - JID tujuan kirim
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function handleSticker(sock, msg, jid) {
  try {
    let targetMessage = null;
    let mediaType = null;

    const msgType = getContentType(msg.message);

    // ── Kasus 1: Pesan adalah gambar/video dengan caption /stiker ─────────
    if (msgType === 'imageMessage') {
      targetMessage = msg.message.imageMessage;
      mediaType = 'image';
    } else if (msgType === 'videoMessage') {
      targetMessage = msg.message.videoMessage;
      mediaType = 'video';
    }

    // ── Kasus 2: Reply ke gambar/video dengan perintah /stiker ────────────
    const quotedMsg =
      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!targetMessage && quotedMsg) {
      const quotedType = getContentType(quotedMsg);
      if (quotedType === 'imageMessage') {
        targetMessage = quotedMsg.imageMessage;
        mediaType = 'image';
      } else if (quotedType === 'videoMessage') {
        targetMessage = quotedMsg.videoMessage;
        mediaType = 'video';
      }
    }

    if (!targetMessage || !mediaType) {
      return {
        success: false,
        error:
          'Kirim gambar dengan caption */stiker*, atau reply gambar dengan */stiker* untuk membuat stiker! 📸',
      };
    }

    // ── Download media ─────────────────────────────────────────────────────
    const buffer = await downloadMedia(targetMessage, mediaType);

    let stickerBuffer;

    if (mediaType === 'image') {
      // Konversi gambar ke WebP stiker
      stickerBuffer = await imageToSticker(buffer);
    } else if (mediaType === 'video') {
      // Untuk video, ambil frame pertama menggunakan sharp
      // Catatan: Sharp tidak support video, kita pakai frame tertulis di buffer
      // Fallback: konversi gif/video sederhana
      try {
        stickerBuffer = await sharp(buffer, { pages: 1 })
          .resize(512, 512, {
            fit: 'contain',
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          })
          .webp({ quality: 80 })
          .toBuffer();
      } catch {
        return {
          success: false,
          error:
            '❌ Format video tidak didukung. Gunakan gambar (JPG/PNG/GIF) untuk membuat stiker!',
        };
      }
    }

    // ── Kirim stiker ───────────────────────────────────────────────────────
    await sock.sendMessage(jid, {
      sticker: stickerBuffer,
    });

    return { success: true };
  } catch (err) {
    console.error('❌ Sticker error:', err?.message || err);
    return {
      success: false,
      error: 'Gagal membuat stiker. Pastikan gambar valid dan coba lagi!',
    };
  }
}

module.exports = { handleSticker };
