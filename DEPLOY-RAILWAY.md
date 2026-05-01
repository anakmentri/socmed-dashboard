# Deploy ke Railway — Migrasi dari Vercel

## Konteks
Vercel Hobby plan kena soft-block karena bandwidth (`fastOriginTransfer`) habis bulan ini.
Reset di siklus billing berikutnya (~9 hari lagi).

Solusi tercepat: deploy ke Railway. Free $5 credit/bulan, support Node.js + pg.

---

## Langkah 1: Setup Akun Railway (5 menit)

1. Buka https://railway.com/login
2. Klik **Login with GitHub** → pakai akun yang sama dengan repo `anakmentri/socmed-dashboard`
3. Verifikasi email kalau diminta
4. Selesai — kamu otomatis dapat $5 free credit/bulan

## Langkah 2: Deploy Project (3 menit)

1. Di Railway dashboard klik **+ New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repo **`anakmentri/socmed-dashboard`** → branch **`master`**
4. Railway auto-detect Next.js dan mulai build (~3 menit)

## Langkah 3: Tambah Environment Variables (10 menit)

Setelah project terbuat, klik **Variables** tab. Tambahkan satu per satu (copy dari `.env.local` di komputer kamu):

```
NEXT_PUBLIC_SUPABASE_URL=https://socmedanalytics.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable__rqOgPSNIjXwtqbg-iYIfQ_MkzGF9ph
PG_HOST=aws-1-ap-southeast-1.pooler.supabase.com
PG_PORT=6543
PG_DATABASE=postgres
PG_USER=creative_nando.vhsridhwjbqypwummrtp
PG_PASSWORD=skKxNzmmQwaj73#
CRON_SECRET=2Pq35meXPM59/IzZG9U5jiITObSA6hAS
NEXT_PUBLIC_CRON_SECRET=2Pq35meXPM59/IzZG9U5jiITObSA6hAS
TWITTER_CLIENT_ID=<copy dari Vercel project settings>
TWITTER_CLIENT_SECRET=<copy dari Vercel>
TWITTER_API_KEY=<copy dari Vercel>
TWITTER_API_SECRET=<copy dari Vercel>
TWITTER_BEARER_TOKEN=<copy dari Vercel>
TWITTER_CALLBACK_URL=<akan di-update setelah dapat Railway URL>
```

**Cara copy dari Vercel:** buka https://vercel.com/anakmentris-projects/dashboard-next/settings/environment-variables → klik mata 👁 di samping setiap var → copy value. (Project Vercel tidak ke-delete walau soft-block, env vars masih bisa diakses.)

Setelah semua var diisi, klik **Deploy** (Railway otomatis re-deploy).

## Langkah 4: Dapatkan Public URL Railway

1. Di project Railway, klik **Settings** → scroll ke **Networking**
2. Klik **Generate Domain** → Railway kasih URL seperti `dashboard-next-production-xxxx.up.railway.app`
3. Copy URL ini

## Langkah 5: Update TWITTER_CALLBACK_URL

1. Edit env var `TWITTER_CALLBACK_URL` jadi:
   ```
   https://<URL-railway-kamu>/api/twitter/callback
   ```
2. **JANGAN LUPA**: Update juga di Twitter Developer Portal:
   - Buka https://developer.twitter.com/en/portal/projects-and-apps
   - Pilih app kamu → User authentication settings → Edit
   - Tambahkan callback URL Railway baru ke Callback URLs (jangan hapus yang Vercel, biar bisa balik nanti)

## Langkah 6: Pindahkan Custom Domain socmedanalytics.com (15 menit)

1. Di Railway → Settings → Networking → klik **Custom Domain**
2. Masukkan `socmedanalytics.com`
3. Railway kasih CNAME target seperti `xxxx.up.railway.app`
4. Buka penyedia DNS kamu (Cloudflare/Namecheap/dll yang manage socmedanalytics.com)
5. Hapus CNAME lama yang point ke Vercel
6. Tambahkan CNAME baru:
   - Name: `@` (atau `socmedanalytics.com`)
   - Type: `CNAME`
   - Value: `<railway CNAME yang dikasih>`
7. Tunggu propagasi (5-30 menit)
8. Setelah propagasi, dashboard kamu **socmedanalytics.com** sudah point ke Railway 🎉

## Langkah 7: Setup Cron (PENTING)

Railway tidak punya cron built-in seperti Vercel. Solusinya:
- **cron-job.org sudah jalan** (yang sudah kita setup sebelumnya) — tinggal ganti URL ke Railway
- Buka https://cron-job.org → cronjobs kamu → edit:
  - URL `/api/cron/auto-post` → ganti host ke Railway atau tetap pakai socmedanalytics.com (kalau domain sudah pindah)
  - URL `/api/cron/twitter-metrics` → tambahkan baru, schedule daily

## Langkah 8: Tutup Vercel (Opsional)

Setelah Railway jalan dan domain pindah:
- Vercel project bisa di-delete untuk menghindari kebingungan
- Atau dibiarkan saja — toh sudah soft-block, tidak akan jalan

---

## Test Setelah Deploy

1. Buka URL Railway (sebelum domain pindah) atau https://socmedanalytics.com (setelah domain pindah)
2. Login dengan akun admin
3. Cek halaman:
   - Overview ✓
   - Auto Post → coba bulk post ke 1-2 akun ✓
   - Scheduler ✓
   - Report ✓

Kalau ada error, kasih tau saya screenshot-nya, saya bantu debug.

---

## Catatan Biaya

Railway free $5 credit/bulan. Estimasi pemakaian dashboard ini:
- Compute (always-on): ~$3/bulan
- Bandwidth: tergantung traffic, biasanya $1-2/bulan
- **Total estimasi: $4-5/bulan** = masih dalam free credit

Kalau lewat budget free, Railway akan email warning. Bisa upgrade ke Hobby plan ($5/bulan + usage) atau pause.

## Alternatif: Tetap Vercel + Upgrade ke Pro

Kalau gak mau migrate, opsi paling cepat: **upgrade Vercel Pro $20/mo** di
https://vercel.com/anakmentris-projects/~/settings/billing

Setelah upgrade, dashboard auto-resume dalam menit. Tidak perlu pindah hosting.

Trade-off:
- Vercel Pro $20/mo (mahal tapi cepat, tidak perlu migrate)
- Railway free-$5/mo (perlu setup 30 menit, jangka panjang lebih murah)
