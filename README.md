# 🤖 WA AI Bot v2

Bot WhatsApp AI menggunakan **whatsapp-web.js** + **OpenAI GPT**.

## ✨ Fitur
- 💬 AI Chat di private (otomatis jawab)
- 💬 AI Chat di grup (jawab kalau di-reply)
- 🎨 Buat stiker dari gambar (`/stiker`)
- 🧠 Ingat konteks percakapan per user (1 jam)

---

## 🚀 Deploy ke Railway

### 1. Push ke GitHub
```bash
git init
git add .
git commit -m "init wa-ai-bot"
git remote add origin https://github.com/USERNAME/wa-ai-bot.git
git push -u origin main
```

### 2. Buat project di Railway
1. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Pilih repo kamu

### 3. Set Environment Variables
Di tab **Variables** Railway, tambahkan:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | API Key OpenAI kamu |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `BOT_NAME` | `WA AI Bot` |
| `BOT_PERSONALITY` | *(opsional, custom personality AI)* |
| `MAX_HISTORY` | `10` |

### 4. Scan QR
- Buka tab **Deployments** → klik deployment terbaru → **View Logs**
- QR Code akan muncul di log
- Scan dengan WhatsApp: **Setelan → Perangkat Tertaut → Tautkan Perangkat**

---

## 💻 Jalankan Lokal

```bash
npm install
cp .env.example .env
# Edit .env isi OPENAI_API_KEY
npm start
```

---

## 📱 Cara Pakai

| Situasi | Cara |
|---|---|
| Chat pribadi | Kirim pesan apa saja |
| Di grup | Reply pesan bot |
| Buat stiker | Kirim gambar + caption `/stiker` |
| Buat stiker | Reply gambar orang lain dengan `/stiker` |
| Reset AI | `/reset` |
| Cek bot | `/ping` |
| Bantuan | `/help` |

---

## ❓ FAQ

**Q: Session hilang setelah Railway restart?**  
A: Tambahkan Railway Volume dan mount ke `/app/session` untuk persistensi session.

**Q: Error Puppeteer/Chromium?**  
A: Sudah dikonfigurasi di `nixpacks.toml`. Pastikan file ini ikut di-push ke GitHub.

**Q: Bot tidak jawab di grup?**  
A: Harus **reply** pesan dari bot (bukan kirim pesan baru).
