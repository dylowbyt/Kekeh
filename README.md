# 🤖 WA AI Bot

Bot WhatsApp berbasis AI menggunakan OpenAI GPT, dilengkapi fitur membuat stiker.

## ✨ Fitur

- **AI Chatbot** — Chat langsung di private, atau reply pesan bot di grup
- **Buat Stiker** — Ubah gambar menjadi stiker WhatsApp dengan `/stiker`
- **Riwayat Percakapan** — Bot ingat konteks percakapan selama 1 jam
- **Multi-grup** — Bisa dipakai di banyak grup sekaligus

## 🚀 Deploy ke Railway

### 1. Persiapan

1. Buat akun di [railway.app](https://railway.app)
2. Install Railway CLI (opsional): `npm install -g @railway/cli`
3. Siapkan API Key OpenAI dari [platform.openai.com](https://platform.openai.com)

### 2. Upload ke GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/USERNAME/wa-ai-bot.git
git push -u origin main
```

### 3. Deploy di Railway

1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Pilih repo `wa-ai-bot` kamu
3. Masuk ke tab **Variables** dan tambahkan:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | `sk-xxxxxxxx` (API Key OpenAI kamu) |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `BOT_NAME` | `WA AI Bot` |
| `BOT_PERSONALITY` | Kamu adalah asisten AI yang ramah... |
| `MAX_HISTORY` | `10` |

4. Railway akan otomatis build dan deploy.

### 4. Scan QR Code

Setelah deploy, buka **Logs** di Railway. Akan muncul QR code di terminal.
Scan dengan WhatsApp: **Setelan → Perangkat Tertaut → Tautkan Perangkat**

> ⚠️ **Penting:** Setelah scan QR, Railway akan menyimpan session di folder `session/`. 
> Jika kamu restart ulang service, QR tidak perlu scan lagi selama session masih ada.

---

## 💻 Jalankan Lokal

```bash
# Clone / download project
cd wa-ai-bot

# Install dependencies
npm install

# Copy dan isi .env
cp .env.example .env
# Edit .env, isi OPENAI_API_KEY

# Jalankan bot
npm start
```

---

## 📱 Cara Penggunaan

### Chat Pribadi (Private)
Langsung kirim pesan apa saja → bot akan balas seperti AI chatbot.

### Di Grup
Bot **tidak** menjawab semua pesan di grup. Hanya menjawab jika:
- Kamu **reply** pesan dari bot

### Perintah (awalan `/`)

| Perintah | Fungsi |
|---|---|
| `/stiker` atau `/s` | Ubah gambar jadi stiker |
| `/help` | Lihat semua perintah |
| `/reset` | Reset riwayat AI |
| `/ping` | Cek bot aktif |

### Cara Buat Stiker
1. **Metode 1:** Kirim gambar dengan caption `/stiker`
2. **Metode 2:** Reply gambar orang lain dengan `/stiker`

---

## 📁 Struktur Project

```
wa-ai-bot/
├── index.js          # Entry point, logika utama bot
├── features/
│   ├── ai.js         # Modul OpenAI AI Chat
│   └── sticker.js    # Modul pembuatan stiker
├── session/          # Data session WA (auto-generated)
├── tmp/              # File sementara (auto-generated)
├── .env.example      # Template environment variables
├── .gitignore
├── railway.toml      # Konfigurasi Railway
├── Procfile
└── package.json
```

---

## ⚙️ Environment Variables

| Variable | Wajib | Default | Keterangan |
|---|---|---|---|
| `OPENAI_API_KEY` | ✅ | - | API Key dari OpenAI |
| `OPENAI_MODEL` | ❌ | `gpt-4o-mini` | Model yang digunakan |
| `BOT_NAME` | ❌ | `WA AI Bot` | Nama bot |
| `BOT_PERSONALITY` | ❌ | *(default)* | System prompt AI |
| `MAX_HISTORY` | ❌ | `10` | Jumlah pesan history per user |

---

## ❓ FAQ

**Q: QR code muncul di mana?**  
A: Di **Logs** Railway (tab Deployments → klik deployment terbaru → View Logs).

**Q: Apakah session tersimpan saat Railway restart?**  
A: Ya, selama Railway tidak me-reset volume/storage. Untuk Railway free tier, session bisa hilang jika service di-redeploy dari nol. Gunakan Railway Volume untuk persistensi lebih baik.

**Q: Bot tidak menjawab di grup?**  
A: Pastikan kamu **reply** pesan dari bot, bukan mengirim pesan biasa di grup.

**Q: Bisa ganti ke GPT-4?**  
A: Ubah `OPENAI_MODEL` ke `gpt-4o` di Railway Variables. Pastikan akun OpenAI kamu punya akses GPT-4.
