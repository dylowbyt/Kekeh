import 'dotenv/config';
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
  getContentType,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import NodeCache from 'node-cache';
import fs from 'fs';
import { handleSticker } from './features/sticker.js';
import { getAIResponse } from './features/ai.js';

const BOT_NAME = process.env.BOT_NAME || 'WA AI Bot';
const chatHistory = new NodeCache({ stdTTL: 3600 });
const SESSION_DIR = './session';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const logger = pino({ level: 'silent' });
const store = makeInMemoryStore({ logger });

function isGroup(jid) { return jid.endsWith('@g.us'); }
function isFromBot(msg) { return msg.key?.fromMe === true; }

function isReplyToBot(msg, botJid) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return false;
  return (ctx.participant === botJid || ctx.quotedParticipant === botJid || !!ctx.stanzaId);
}

function extractText(msg) {
  const type = getContentType(msg.message);
  if (!type) return '';
  const c = msg.message[type];
  if (type === 'conversation') return c;
  if (type === 'extendedTextMessage') return c?.text || '';
  if (type === 'imageMessage') return c?.caption || '';
  if (type === 'videoMessage') return c?.caption || '';
  return '';
}

async function sendTyping(sock, jid) {
  try { await sock.sendPresenceUpdate('composing', jid); } catch {}
}

async function handleCommand(sock, msg, command, args, jid, senderJid) {
  const cmd = command.toLowerCase();

  if (cmd === 'stiker' || cmd === 'sticker' || cmd === 's') {
    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
    const result = await handleSticker(sock, msg, jid);
    if (!result.success) {
      await sock.sendMessage(jid, { text: `❌ ${result.error}` }, { quoted: msg });
    } else {
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    }
    return;
  }

  if (cmd === 'help' || cmd === 'bantuan') {
    const helpText = `╔══════════════════════╗
║   🤖 *${BOT_NAME}*
╚══════════════════════╝

*📌 Fitur Bot:*

*💬 AI Chat (Private)*
Langsung ketik pesanmu, bot jawab otomatis!

*💬 AI Chat (Grup)*
Reply pesan bot untuk dapat jawaban AI.

*🎨 Stiker*
\`/stiker\` atau \`/s\` — Ubah gambar jadi stiker
• Kirim gambar + caption \`/stiker\`
• Atau reply gambar dengan \`/stiker\`

*ℹ️ Lainnya*
\`/help\` — Menu ini
\`/reset\` — Reset riwayat AI
\`/ping\` — Cek bot aktif

_Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}_`;
    await sock.sendMessage(jid, { text: helpText }, { quoted: msg });
    return;
  }

  if (cmd === 'reset' || cmd === 'clear') {
    chatHistory.del(senderJid);
    await sock.sendMessage(jid, { text: '✅ Riwayat percakapan direset!' }, { quoted: msg });
    return;
  }

  if (cmd === 'ping') {
    const start = Date.now();
    await sock.sendMessage(jid, { text: `🏓 *Pong!*\n⚡ ${Date.now() - start}ms\n✅ Bot aktif!` }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, { text: `❓ Perintah \`/${command}\` tidak dikenal. Ketik \`/help\`.` }, { quoted: msg });
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🚀 Memulai ${BOT_NAME}...`);

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['WA AI Bot', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  });

  store.bind(sock.ev);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan QR Code ini dengan WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n⏳ Menunggu scan...\n');
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const reconnect = code !== DisconnectReason.loggedOut;
      console.log(`❌ Terputus (${code}). Reconnect: ${reconnect}`);
      if (reconnect) {
        setTimeout(startBot, 5000);
      } else {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        process.exit(0);
      }
    }

    if (connection === 'open') {
      console.log(`\n✅ Bot terhubung!`);
      console.log(`📞 Nomor: ${sock.user?.id?.split(':')[0]}`);
      console.log(`🤖 Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}`);
      console.log(`\n💡 Bot siap!\n`);
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (isFromBot(msg)) continue;
        if (!msg.message) continue;
        const jid = msg.key.remoteJid;
        if (!jid) continue;

        const group = isGroup(jid);
        const senderJid = group ? (msg.key.participant || jid) : jid;
        const botJid = sock.user?.id?.replace(/:\d+@/, '@') || '';
        const text = extractText(msg).trim();

        if (text.startsWith('/')) {
          const [cmdRaw, ...args] = text.slice(1).split(' ');
          const command = cmdRaw.trim();
          if (!command) continue;
          await sendTyping(sock, jid);
          await handleCommand(sock, msg, command, args, jid, senderJid);
          continue;
        }

        if (group && !isReplyToBot(msg, botJid)) continue;
        if (!text) continue;

        await sendTyping(sock, jid);
        const history = chatHistory.get(senderJid) || [];
        const aiReply = await getAIResponse(text, history, senderJid);

        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: aiReply });
        const maxHistory = parseInt(process.env.MAX_HISTORY || '10') * 2;
        if (history.length > maxHistory) history.splice(0, history.length - maxHistory);
        chatHistory.set(senderJid, history);

        await sock.sendMessage(jid, { text: aiReply }, { quoted: msg });
      } catch (err) {
        console.error('❌ Error:', err?.message || err);
      }
    }
  });
}

startBot().catch((err) => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});
