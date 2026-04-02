require('dotenv').config();
const {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  jidDecode,
  proto,
  getContentType,
  downloadContentFromMessage,
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const OpenAI = require('openai');
const NodeCache = require('node-cache');
const fs = require('fs');
const path = require('path');
const { handleSticker } = require('./features/sticker');
const { getAIResponse } = require('./features/ai');

// ─── Config ────────────────────────────────────────────────────────────────────
const BOT_NAME = process.env.BOT_NAME || 'WA AI Bot';

// Cache untuk conversation history per user (TTL: 1 jam)
const chatHistory = new NodeCache({ stdTTL: 3600 });

// Pastikan folder session ada
const SESSION_DIR = './session';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

// ─── Logger ────────────────────────────────────────────────────────────────────
const logger = pino({ level: 'silent' });

// ─── In-memory store ──────────────────────────────────────────────────────────
const store = makeInMemoryStore({ logger });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getJid(jid) {
  return jidDecode(jid)?.user + '@s.whatsapp.net';
}

function isGroup(jid) {
  return jid.endsWith('@g.us');
}

function isFromBot(msg) {
  return msg.key?.fromMe === true;
}

/**
 * Cek apakah pesan adalah reply ke bot (di grup)
 */
function isReplyToBot(msg, botJid) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return false;
  const participant = ctx.participant || '';
  const quotedParticipant = ctx.quotedParticipant || '';
  return (
    participant === botJid ||
    quotedParticipant === botJid ||
    ctx.stanzaId !== undefined
  );
}

/**
 * Ekstrak teks dari berbagai tipe pesan
 */
function extractText(msg) {
  const type = getContentType(msg.message);
  if (!type) return '';
  const content = msg.message[type];
  if (type === 'conversation') return content;
  if (type === 'extendedTextMessage') return content?.text || '';
  if (type === 'imageMessage') return content?.caption || '';
  if (type === 'videoMessage') return content?.caption || '';
  return '';
}

/**
 * Kirim pesan dengan react (opsional)
 */
async function sendTyping(sock, jid) {
  await sock.sendPresenceUpdate('composing', jid);
}

// ─── Command Handler ──────────────────────────────────────────────────────────
async function handleCommand(sock, msg, command, args, jid, senderJid) {
  const cmdLower = command.toLowerCase();

  switch (cmdLower) {
    // ── /sticker ──────────────────────────────────────────────────────────────
    case 'stiker':
    case 'sticker':
    case 's': {
      await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
      const result = await handleSticker(sock, msg, jid);
      if (!result.success) {
        await sock.sendMessage(
          jid,
          { text: `❌ ${result.error}` },
          { quoted: msg }
        );
      }
      break;
    }

    // ── /help ─────────────────────────────────────────────────────────────────
    case 'help':
    case 'bantuan': {
      const helpText = `╔══════════════════════╗
║   🤖 *${BOT_NAME}*   ║
╚══════════════════════╝

*📌 Fitur Bot:*

*💬 AI Chat (Private)*
Langsung ketik pesanmu, bot akan menjawab otomatis!

*💬 AI Chat (Grup)*
Reply pesan bot untuk mendapatkan jawaban AI.

*🎨 Stiker*
\`/stiker\` atau \`/s\` - Ubah gambar/video menjadi stiker
Caranya: Kirim gambar/video dengan caption \`/stiker\`, atau reply gambar/video dengan \`/stiker\`

*ℹ️ Lainnya*
\`/help\` - Tampilkan menu bantuan ini
\`/reset\` - Reset riwayat percakapan AI
\`/ping\` - Cek apakah bot aktif

_Bot berjalan dengan OpenAI ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}_`;

      await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
      break;
    }

    // ── /reset ────────────────────────────────────────────────────────────────
    case 'reset':
    case 'clear': {
      chatHistory.del(senderJid);
      await sock.sendMessage(
        jid,
        { text: '✅ Riwayat percakapan kamu telah direset!' },
        { quoted: msg }
      );
      break;
    }

    // ── /ping ─────────────────────────────────────────────────────────────────
    case 'ping': {
      const start = Date.now();
      await sock.sendMessage(
        jid,
        { text: `🏓 *Pong!*\n⚡ Latency: ${Date.now() - start}ms\n✅ Bot aktif!` },
        { quoted: msg }
      );
      break;
    }

    // ── Unknown command ───────────────────────────────────────────────────────
    default: {
      await sock.sendMessage(
        jid,
        {
          text: `❓ Perintah \`/${command}\` tidak dikenal.\nKetik \`/help\` untuk melihat daftar perintah.`,
        },
        { quoted: msg }
      );
    }
  }
}

// ─── Main Bot Logic ───────────────────────────────────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🚀 Memulai ${BOT_NAME}...`);
  console.log(`📦 Baileys version: ${version.join('.')}\n`);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false, // kita handle sendiri supaya lebih cantik
    browser: ['WA AI Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    generateHighQualityLinkPreview: true,
  });

  store.bind(sock.ev);

  // ── QR Code ──────────────────────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan QR Code berikut dengan WhatsApp kamu:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n⏳ Menunggu scan QR...\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `❌ Koneksi terputus. Status: ${statusCode}. Reconnect: ${shouldReconnect}`
      );

      if (shouldReconnect) {
        console.log('🔄 Mencoba reconnect dalam 5 detik...');
        setTimeout(startBot, 5000);
      } else {
        console.log('🚪 Bot logout. Hapus folder session/ lalu restart.');
        // Hapus session agar QR muncul lagi
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        process.exit(0);
      }
    }

    if (connection === 'open') {
      const botNumber = sock.user?.id;
      console.log(`\n✅ Bot terhubung!`);
      console.log(`📞 Nomor Bot: ${botNumber?.split(':')[0]}`);
      console.log(`🤖 Model AI: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
      console.log(`\n💡 Bot siap digunakan!\n`);
    }
  });

  // ── Save credentials ──────────────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Message Handler ───────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        // Skip pesan dari bot sendiri
        if (isFromBot(msg)) continue;
        // Skip jika tidak ada pesan
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid) continue;

        const group = isGroup(jid);
        const senderJid = group
          ? msg.key.participant || msg.key.remoteJid
          : jid;

        const botJid = sock.user?.id?.replace(/:\d+/, '') + '@s.whatsapp.net';
        const text = extractText(msg).trim();

        // ── Command Handler (/...) ─────────────────────────────────────────
        if (text.startsWith('/')) {
          const [cmdRaw, ...args] = text.slice(1).split(' ');
          const command = cmdRaw.trim();
          if (!command) continue;

          await sendTyping(sock, jid);
          await handleCommand(sock, msg, command, args, jid, senderJid);
          continue;
        }

        // ── AI Chat Logic ──────────────────────────────────────────────────
        if (group) {
          // Di grup: hanya jawab kalau pesan adalah reply ke bot
          const isReply = isReplyToBot(msg, botJid);
          if (!isReply) continue;
        }

        // Private: semua pesan dijawab AI
        if (!text) continue;

        await sendTyping(sock, jid);

        // Ambil history chat
        const history = chatHistory.get(senderJid) || [];

        // Dapatkan respons AI
        const aiReply = await getAIResponse(text, history, senderJid);

        // Update history
        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: aiReply });

        // Batasi history agar tidak terlalu panjang
        const maxHistory = parseInt(process.env.MAX_HISTORY || '10') * 2;
        if (history.length > maxHistory) {
          history.splice(0, history.length - maxHistory);
        }
        chatHistory.set(senderJid, history);

        // Kirim balasan
        await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
      } catch (err) {
        console.error('❌ Error handling message:', err?.message || err);
      }
    }
  });

  return sock;
}

// ─── Start ────────────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
