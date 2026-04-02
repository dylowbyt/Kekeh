const { MessageMedia } = require('whatsapp-web.js');
const sharp = require('sharp');

/**
 * Konversi buffer gambar ke WebP stiker 512x512
 */
async function toStickerWebp(buffer) {
  return sharp(buffer)
    .resize(512, 512, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * Handler fitur stiker
 * @param {import('whatsapp-web.js').Message} msg
 * @param {import('whatsapp-web.js').Client} client
 */
async function handleSticker(msg, client) {
  try {
    let media = null;

    // Kasus 1: Pesan ini sendiri punya media (gambar/video + caption /stiker)
    if (msg.hasMedia) {
      media = await msg.downloadMedia();
    }

    // Kasus 2: Reply ke pesan yang punya media
    if (!media && msg.hasQuotedMsg) {
      const quoted = await msg.getQuotedMessage();
      if (quoted.hasMedia) {
        media = await quoted.downloadMedia();
      }
    }

    if (!media) {
      return {
        success: false,
        error: 'Kirim gambar dengan caption */stiker*, atau reply gambar dengan */stiker*! 📸',
      };
    }

    // Hanya support gambar
    if (!media.mimetype.startsWith('image/')) {
      return {
        success: false,
        error: 'Hanya gambar yang bisa dijadikan stiker (JPG, PNG, GIF, WebP).',
      };
    }

    // Konversi ke buffer → WebP
    const inputBuffer = Buffer.from(media.data, 'base64');
    const stickerBuffer = await toStickerWebp(inputBuffer);

    // Buat MessageMedia dari buffer WebP
    const stickerMedia = new MessageMedia(
      'image/webp',
      stickerBuffer.toString('base64'),
      'sticker.webp'
    );

    // Kirim sebagai stiker
    const chat = await msg.getChat();
    await chat.sendMessage(stickerMedia, { sendMediaAsSticker: true });

    return { success: true };
  } catch (err) {
    console.error('❌ Sticker error:', err?.message || err);
    return { success: false, error: 'Gagal membuat stiker. Coba lagi!' };
  }
}

module.exports = { handleSticker };
