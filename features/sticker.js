import { downloadContentFromMessage, getContentType } from '@whiskeysockets/baileys';
import sharp from 'sharp';
import fs from 'fs';

const TMP_DIR = './tmp';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

async function downloadMedia(message, mediaType) {
  const stream = await downloadContentFromMessage(message, mediaType);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function toStickerWebp(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
}

export async function handleSticker(sock, msg, jid) {
  try {
    let targetMessage = null;
    let mediaType = null;

    const msgType = getContentType(msg.message);

    // Kasus 1: Pesan gambar/video langsung dengan caption /stiker
    if (msgType === 'imageMessage') {
      targetMessage = msg.message.imageMessage;
      mediaType = 'image';
    } else if (msgType === 'videoMessage') {
      targetMessage = msg.message.videoMessage;
      mediaType = 'video';
    }

    // Kasus 2: Reply ke gambar/video
    const quotedMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
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
        error: 'Kirim gambar dengan caption */stiker*, atau reply gambar dengan */stiker*! 📸',
      };
    }

    const buffer = await downloadMedia(targetMessage, mediaType);

    let stickerBuffer;
    try {
      stickerBuffer = await toStickerWebp(buffer);
    } catch (e) {
      return { success: false, error: 'Format gambar tidak didukung. Coba gambar lain!' };
    }

    await sock.sendMessage(jid, { sticker: stickerBuffer });
    return { success: true };
  } catch (err) {
    console.error('❌ Sticker error:', err?.message || err);
    return { success: false, error: 'Gagal membuat stiker. Coba lagi!' };
  }
}
