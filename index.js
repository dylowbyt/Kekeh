require('dotenv').config();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const NodeCache = require('node-cache');
const { getAIResponse } = require('./features/ai');
const { handleSticker } = require('./features/sticker');

// ─── Config ───────────────────────────────────────────────────────────────────
const BOT_NAME = process.env.BOT_NAME || 'WA AI Bot';

// History percakapan per user (TTL: 1 jam)
const chatHistory = new NodeCache({ stdTTL: 3600 });

// ─── WhatsApp Client ──────────────────────────────────────────────────────────
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu',
    ],
  },
});

// ─── QR Code ──────────────────────────────────────────────────────────────────
client.on('qr', (qr) => {
  console.log('\n📱 Scan QR Code ini dengan WhatsApp kamu:\n');
  qrcode.generate(qr, { small: true });
  console.log('\n⏳ Menunggu scan QR...\n');
});

// ─── Ready ────────────────────────────────────────────────────────────────────
client.on('ready', () => {
  const info = client.info;
  console.log('\n✅ Bot terhubung!');
  console.log(`📞 Nomor  : ${info.wid.user}`);
  console.log(`👤 Nama   : ${info.pushname}`);
  console.log(`🤖 Model  : ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
  console.log('\n💡 Bot siap digunakan!\n');
});

// ─── Auth Failure ─────────────────────────────────────────────────────────────
client.on('auth_failure', (msg) => {
  console.error('❌ Auth gagal:', msg);
});

// ─── Disconnected ─────────────────────────────────────────────────────────────
client.on('disconnected', (reason) => {
  console.log('❌ Bot terputus:', reason);
  console.log('🔄 Mencoba reconnect...');
  client.initialize();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isGroup(msg) {
  return msg.from.endsWith('@g.us');
}

async function sendTyping(msg) {
  try {
    const chat = await msg.getChat();
    await chat.sendStateTyping();
  } catch {}
}

// ─── Command Handler ──────────────────────────────────────────────────────────
async function handleCommand(msg, command, args) {
  const cmd = command.toLowerCase();
  const chat = await msg.getChat();
  const senderId = msg.author || msg.from; // author untuk grup

  switch (cmd) {
    // ── /stiker ───────────────────────────────────────────────────────────────
    case 's':
    case 'stiker':
    case 'sticker': {
      await msg.react('⏳');
      const result = await handleSticker(msg, client);
      if (result.success) {
        await msg.react('✅');
      } else {
        await msg.reply(`❌ ${result.error}`);
      }
      break;
    }

    // ── /help ─────────────────────────────────────────────────────────────────
    case 'help':
    case 'bantuan': {
      const helpText = `╔══════════════════════╗
║   🤖 *${BOT_NAME}*
╚══════════════════════╝

*📌 Cara Pakai:*

*💬 AI Chat (Private)*
Langsung kirim pesan → bot jawab otomatis.

*💬 AI Chat (Grup)*
Reply pesan bot → bot jawab dengan AI.

*🎨 Buat Stiker*
\`/stiker\` atau \`/s\`
• Kirim gambar + caption \`/stiker\`
• Atau reply gambar dengan \`/stiker\`

*⚙️ Perintah Lain*
\`/help\` — Menu ini
\`/reset\` — Reset riwayat percakapan AI
\`/ping\` — Cek bot aktif

_Model AI: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}_`;
      await msg.reply(helpText);
      break;
    }

    // ── /reset ────────────────────────────────────────────────────────────────
    case 'reset':
    case 'clear': {
      chatHistory.del(senderId);
      await msg.reply('✅ Riwayat percakapanmu sudah direset!');
      break;
    }

    // ── /ping ─────────────────────────────────────────────────────────────────
    case 'ping': {
      const start = Date.now();
      await msg.reply(`🏓 *Pong!*\n⚡ Latency: ${Date.now() - start}ms\n✅ Bot aktif!`);
      break;
    }

    // ── Unknown ───────────────────────────────────────────────────────────────
    default: {
      await msg.reply(`❓ Perintah \`/${command}\` tidak dikenal.\nKetik \`/help\` untuk bantuan.`);
    }
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────
client.on('message_create', async (msg) => {
  try {
    // Skip pesan dari bot sendiri
    if (msg.fromMe) return;
    // Skip status/broadcast
    if (msg.from === 'status@broadcast') return;

    const body = (msg.body || '').trim();
    const group = isGroup(msg);
    const senderId = msg.author || msg.from;

    // ── Commands (/...) ───────────────────────────────────────────────────────
    if (body.startsWith('/')) {
      const [cmdRaw, ...args] = body.slice(1).split(' ');
      const command = cmdRaw.trim();
      if (!command) return;
      await sendTyping(msg);
      await handleCommand(msg, command, args);
      return;
    }

    // ── AI Chat ───────────────────────────────────────────────────────────────
    if (group) {
      // Di grup: hanya jawab jika reply ke pesan bot
      if (!msg.hasQuotedMsg) return;
      const quoted = await msg.getQuotedMessage();
      if (!quoted.fromMe) return; // Quoted bukan dari bot
    }

    if (!body) return;

    await sendTyping(msg);

    // Ambil & update history
    const history = chatHistory.get(senderId) || [];
    const aiReply = await getAIResponse(body, history, senderId);

    history.push({ role: 'user', content: body });
    history.push({ role: 'assistant', content: aiReply });

    const maxHistory = parseInt(process.env.MAX_HISTORY || '10') * 2;
    if (history.length > maxHistory) {
      history.splice(0, history.length - maxHistory);
    }
    chatHistory.set(senderId, history);

    await msg.reply(aiReply);
  } catch (err) {
    console.error('❌ Error handling message:', err?.message || err);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
console.log(`\n🚀 Memulai ${BOT_NAME}...`);
client.initialize();
