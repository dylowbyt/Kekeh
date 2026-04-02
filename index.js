import dotenv from 'dotenv';
dotenv.config();

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  getContentType,
  downloadContentFromMessage,
  makeInMemoryStore,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import NodeCache from 'node-cache';
import fs from 'fs';
import { getAIResponse } from './features/ai.js';
import { handleSticker } from './features/sticker.js';

// ─── Setup ────────────────────────────────────────────────────────────────────
const BOT_NAME = process.env.BOT_NAME || 'WA AI Bot';
const chatHistory = new NodeCache({ stdTTL: 3600 });
const SESSION_DIR = './session';
if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

const logger = pino({ level: 'silent' });

// ─── Helpers ──────────────────────────────────────────────────────────────────
function isGroup(jid) { return jid?.endsWith('@g.us'); }
function isFromBot(msg) { return msg.key?.fromMe === true; }

function isReplyToBot(msg, botJid) {
  const ctx = msg.message?.extendedTextMessage?.contextInfo;
  if (!ctx) return false;
  return ctx.participant === botJid || ctx.quotedParticipant === botJid;
}

function extractText(msg) {
  const type = getContentType(msg.message);
  if (!type) return '';
  const c = msg.message[type];
  if (type === 'conversation') return c || '';
  if (type === 'extendedTextMessage') return c?.text || '';
  if (type === 'imageMessage') return c?.caption || '';
  if (type === 'videoMessage') return c?.caption || '';
  return '';
}

// ─── Commands ─────────────────────────────────────────────────────────────────
async function handleCommand(sock, msg, command, jid, senderJid) {
  const cmd = command.toLowerCase();

  if (cmd === 's' || cmd === 'stiker' || cmd === 'sticker') {
    await sock.sendMessage(jid, { react: { text: '⏳', key: msg.key } });
    const result = await handleSticker(sock, msg, jid);
    if (result.success) {
      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } else {
      await sock.sendMessage(jid, { text: `❌ ${result.error}` }, { quoted: msg });
    }
    return;
  }

  if (cmd === 'help' || cmd === 'bantuan') {
    await sock.sendMessage(jid, {
      text: `🤖 *${BOT_NAME}*\n\n` +
        `*Chat Pribadi:* Langsung ketik pesan\n` +
        `*Di Grup:* Reply pesan bot\n\n` +
        `*/stiker* atau */s* — Buat stiker dari gambar\n` +
        `*/reset* — Reset riwayat AI\n` +
        `*/ping* — Cek bot aktif\n` +
        `*/help* — Menu ini\n\n` +
        `_Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}_`
    }, { quoted: msg });
    return;
  }

  if (cmd === 'reset' || cmd === 'clear') {
    chatHistory.del(senderJid);
    await sock.sendMessage(jid, { text: '✅ Riwayat direset!' }, { quoted: msg });
    return;
  }

  if (cmd === 'ping') {
    await sock.sendMessage(jid, { text: '🏓 Pong! Bot aktif ✅' }, { quoted: msg });
    return;
  }

  await sock.sendMessage(jid, {
    text: `❓ Perintah /${command} tidak dikenal. Ketik /help`
  }, { quoted: msg });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`\n🚀 Starting ${BOT_NAME} (Baileys ${version.join('.')})\n`);

  const sock = makeWASocket.default({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['WA-Bot', 'Chrome', '120.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  const store = makeInMemoryStore({ logger });
  store.bind(sock.ev);

  // QR & connection
  sock.ev.on('connection.update', ({ qr, connection, lastDisconnect }) => {
    if (qr) {
      console.log('\n📱 Scan QR ini di WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      const num = sock.user?.id?.split(':')[0] || sock.user?.id;
      console.log(`\n✅ Connected! Nomor: ${num}`);
      console.log(`🤖 Model: ${process.env.OPENAI_MODEL || 'gpt-4o-mini'}\n`);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const logout = code === DisconnectReason.loggedOut;
      console.log(`❌ Disconnected (${code}). Logout: ${logout}`);
      if (logout) {
        fs.rmSync(SESSION_DIR, { recursive: true, force: true });
        process.exit(0);
      } else {
        console.log('🔄 Reconnecting in 5s...');
        setTimeout(startBot, 5000);
      }
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // Messages
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      try {
        if (isFromBot(msg) || !msg.message) continue;
        const jid = msg.key.remoteJid;
        if (!jid) continue;

        const group = isGroup(jid);
        const senderJid = group ? (msg.key.participant || jid) : jid;
        const botJid = (sock.user?.id || '').replace(/:\d+@/, '@');
        const text = extractText(msg).trim();

        // Commands
        if (text.startsWith('/')) {
          const cmd = text.slice(1).split(' ')[0].trim();
          if (!cmd) continue;
          try { await sock.sendPresenceUpdate('composing', jid); } catch {}
          await handleCommand(sock, msg, cmd, jid, senderJid);
          continue;
        }

        // AI Chat - grup hanya jawab kalau reply ke bot
        if (group && !isReplyToBot(msg, botJid)) continue;
        if (!text) continue;

        try { await sock.sendPresenceUpdate('composing', jid); } catch {}

        const history = chatHistory.get(senderJid) || [];
        const reply = await getAIResponse(text, history, senderJid);

        history.push({ role: 'user', content: text });
        history.push({ role: 'assistant', content: reply });
        const max = (parseInt(process.env.MAX_HISTORY || '10')) * 2;
        if (history.length > max) history.splice(0, history.length - max);
        chatHistory.set(senderJid, history);

        await sock.sendMessage(jid, { text: reply }, { quoted: msg });
      } catch (e) {
        console.error('❌ msg error:', e?.message);
      }
    }
  });
}

startBot().catch(e => { console.error('Fatal:', e); process.exit(1); });
