import { downloadContentFromMessage, getContentType } from '@whiskeysockets/baileys';
import sharp from 'sharp';

async function downloadMedia(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function handleSticker(sock, msg, jid) {
  try {
    let target = null;
    let mtype = null;

    const msgType = getContentType(msg.message);
    if (msgType === 'imageMessage') { target = msg.message.imageMessage; mtype = 'image'; }
    else if (msgType === 'videoMessage') { target = msg.message.videoMessage; mtype = 'video'; }

    // Kalau reply ke gambar
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!target && quoted) {
      const qt = getContentType(quoted);
      if (qt === 'imageMessage') { target = quoted.imageMessage; mtype = 'image'; }
      else if (qt === 'videoMessage') { target = quoted.videoMessage; mtype = 'video'; }
    }

    if (!target) return { success: false, error: 'Kirim gambar + caption /stiker, atau reply gambar dengan /stiker 📸' };

    const buf = await downloadMedia(target, mtype);
    const webp = await sharp(buf)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 80 })
      .toBuffer();

    await sock.sendMessage(jid, { sticker: webp });
    return { success: true };
  } catch (e) {
    console.error('Sticker error:', e?.message);
    return { success: false, error: 'Gagal buat stiker, coba lagi!' };
  }
}
