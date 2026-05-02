# 🚀 SETUP SUPER MUDAH UNTUK TEMAN

Karena dashboard kamu (anakmentri) sedang offline (Vercel ban bandwidth),
teman deploy ke Vercel Pro-nya pakai database & Twitter app yang SAMA.
Hasil: dashboard hidup lagi di URL baru, semua data anggota tetap utuh.

---

## ✅ Yang Sudah Saya Verifikasi

- Database **utuh 100%**: 211 Twitter conn, 4 Telegram conn, 4 anggota, 248 post history, 11 scheduled posts
- Twitter Dev App **valid** & credentials siap pakai
- Code sudah di-refactor: **auto-detect URL** via Vercel built-in env (gak perlu hardcoded)

---

## 📋 LANGKAH 1: Teman Deploy di Vercel-nya

1. Teman buka https://vercel.com/new
2. Import repo `ojokesusu/twitterdoodstream` → branch `main`
3. Project name: bebas (misal `doodstream`)
4. **EXPAND section "Environment Variables"** ⚠
5. Klik **Bulk Edit** lalu copy-paste BLOCK INI persis:

```env
PG_HOST=aws-1-ap-southeast-1.pooler.supabase.com
PG_PORT=6543
PG_DATABASE=postgres
PG_USER=creative_nando.vhsridhwjbqypwummrtp
PG_PASSWORD=skKxNzmmQwaj73#
CRON_SECRET=2Pq35meXPM59/IzZG9U5jiITObSA6hAS
NEXT_PUBLIC_CRON_SECRET=2Pq35meXPM59/IzZG9U5jiITObSA6hAS
TWITTER_CLIENT_ID=dGZwM2otam9TTFJJQVFPeC00dWQ6MTpjaQ
TWITTER_CLIENT_SECRET=EnAqMEvq3vpnBavvoUNoDYNNTRZ0PfQYQbMHfEgxxigawguoGp
TWITTER_API_KEY=lK3NJVfD9Q115ox8RvUOyxAW7
TWITTER_API_SECRET=2xsjDkbQBODFIbb7GahVCZXaxRl97bFhpBwkCFgHC5ojXiohnK
TWITTER_BEARER_TOKEN=AAAAAAAAAAAAAAAAAAAAACSH9AEAAAAAORJeTIvMSMMZqhOyuTvf1HjJn7s%3DP3R0XIcnhJttoXigIBnLKgvopPgAlidwwvKt8TLmIgnGiyMU5L
```

6. Klik **Deploy** → tunggu ~3 menit sampai status hijau

---

## 📋 LANGKAH 2: Catat URL Vercel Baru

Setelah deploy sukses, Vercel kasih URL seperti:
- `https://doodstream-xxx.vercel.app` (random suffix)

**Catat URL ini**, dipakai untuk update Twitter callback.

---

## 📋 LANGKAH 3: Update Twitter Dev Portal (5 menit)

1. Buka https://developer.twitter.com/en/portal/projects-and-apps
2. Login pakai akun Twitter yang dulu setup app (kemungkinan akun kamu, anakmentri)
3. Pilih app yang sama (yang dipakai sekarang)
4. Klik **Settings → User authentication settings → Edit**
5. Di **Callback URI / Redirect URL** tambahkan URL Vercel baru:
   - URL lama: `https://socmedanalytics.com/api/twitter/callback` (tetap, jangan dihapus)
   - URL baru: `https://doodstream-xxx.vercel.app/api/twitter/callback` (tambahkan)
6. Save

> Anggota yang sudah connect Twitter di dashboard lama, tokennya tetap valid.
> Connect Twitter baru dari URL Vercel teman juga akan jalan.

---

## 📋 LANGKAH 4: Test Login

1. Buka URL Vercel baru di browser
2. Login pakai akun yang sama:
   - Username: `admin`
   - Password: (password admin yang kamu sudah pakai sebelumnya)
3. Cek Overview → Auto Post → Scheduler — semua data harus muncul

---

## 📋 LANGKAH 5 (OPSIONAL): Pindahkan Domain socmedanalytics.com

Kalau mau dashboard tetap di URL `socmedanalytics.com`:

1. Di Vercel teman → Project Settings → Domains → **Add Domain** → `socmedanalytics.com`
2. Vercel kasih instruksi DNS (CNAME atau A record)
3. Buka penyedia DNS kamu (Cloudflare/Niagahoster/dll)
4. Hapus record lama yang point ke Vercel kamu
5. Tambah record baru sesuai instruksi Vercel teman
6. Tunggu propagasi (5-30 menit)

Setelah propagasi, `socmedanalytics.com` akan point ke Vercel teman = dashboard hidup di URL lama.

---

## 📋 LANGKAH 6 (OPSIONAL): Update cron-job.org

Kalau cron-job.org sebelumnya point ke socmedanalytics.com:
- Login https://cron-job.org
- Edit cronjob → ubah URL `https://socmedanalytics.com/api/cron/auto-post?key=...` 
- Ganti host ke URL Vercel baru (atau tetap socmedanalytics.com kalau sudah dipindah DNS)

---

## ⚠ Penting Diketahui

**Yang shared dengan dashboard kamu (anakmentri):**
- Database Supabase (211 Twitter conn, 4 anggota, semua data)
- Twitter Developer App (rate limit shared)
- CRON_SECRET (sama)

**Yang NEW/independent:**
- Vercel hosting (teman's PRO account, bandwidth & function jadi teman yang nanggung)
- URL Vercel baru
- DNS routing

**Risk:**
- Kalau teman pakai database kamu, dia bisa lihat & edit semua data (anggota, post history, schedule)
- Kalau dashboard kamu (Vercel lama) hidup lagi nanti, akan point ke database yang sama → 2 dashboard akses 1 DB OK, tapi pastikan cron-job.org cuma jalan dari 1 URL biar gak double-fire

---

## 🐛 Kalau Build Gagal

Error `supabaseUrl is required` → env var belum di-paste sebelum deploy.
Solusi: Project Settings → Environment Variables → paste block di atas → Redeploy.

Error `relation "twitterdood.xxx" does not exist` → seharusnya gak terjadi (database kamu sudah ada semua tabel). Kalau muncul, kabari saya.

---

## 🎯 Ringkasan Apa yang Kamu Lakukan

| # | Yang lakukan | Berapa lama |
|---|---|---|
| 1 | Teman: deploy di Vercel + paste env vars | 5 menit |
| 2 | Teman: kasih kamu URL Vercel baru | - |
| 3 | Kamu/teman: update Twitter callback URL | 5 menit |
| 4 | Kamu: login & test | 2 menit |
| 5 | (Opsional) Kamu: pindah DNS socmedanalytics.com | 15 menit |

**Total: ~15 menit aktif (di luar waktu tunggu propagasi DNS)**

Setelah Langkah 4, **kamu sudah bisa login lagi** di URL Vercel baru. Step 5-6 cuma kalau mau pertahankan domain socmedanalytics.com.
