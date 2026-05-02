# 🚀 Setup Dashboard Doodstream — Panduan Lengkap

Panduan deploy dashboard ini ke Vercel dengan database Supabase baru.
Total waktu setup: **~30 menit** (sekali jalan).

---

## ⚙ Yang Dibutuhkan

- ✅ Akun **Vercel** (Hobby gratis OK, Pro lebih leluasa untuk traffic tinggi)
- ✅ Akun **Supabase** (Free tier — gratis selamanya untuk traffic kecil)
- ✅ Akun **Twitter Developer** (Free tier OK, kecuali butuh chunked upload video > 5MB)
- ✅ Repo GitHub `ojokesusu/twitterdoodstream` (sudah ada)

---

## 📋 STEP 1: Bikin Supabase Project (5 menit)

1. Buka https://supabase.com/dashboard
2. Klik **New Project**
3. Isi:
   - Project name: `doodstream` (bebas)
   - Database password: **GENERATE STRONG** — simpan baik-baik, dipakai di env var `PG_PASSWORD`
   - Region: pilih **Southeast Asia (Singapore)** (paling dekat Indonesia)
4. Klik **Create new project** → tunggu ~2 menit sampai status hijau
5. Setelah ready, ke **Settings → API** → copy:
   - **Project URL** → simpan untuk `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → simpan untuk `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Ke **Settings → Database → Connection Pooling** → copy:
   - **Host** → `PG_HOST` (misal: `aws-0-ap-southeast-1.pooler.supabase.com`)
   - **Port** → `PG_PORT` = `6543` (WAJIB pooler, bukan 5432)
   - **Database** → `PG_DATABASE` = `postgres`
   - **User** → `PG_USER` (format: `postgres.<project_ref>`)
   - **Password** → `PG_PASSWORD` (yang tadi di-generate)

---

## 📋 STEP 2: Bikin Twitter Developer App (10 menit)

1. Buka https://developer.twitter.com/en/portal/projects-and-apps
2. Login dengan akun Twitter (akun apa saja, bukan harus akun yang mau dipost)
3. Apply for Developer Access kalau belum punya (Free tier instant approve)
4. Klik **+ Add App** atau **Create new App**
5. App name: `doodstream-dashboard` (bebas)
6. Setelah app dibuat, ke tab **Keys and tokens**:
   - **API Key & Secret** → copy untuk `TWITTER_API_KEY` & `TWITTER_API_SECRET`
   - **Bearer Token** → copy untuk `TWITTER_BEARER_TOKEN`
7. Ke tab **Settings → User authentication settings** → **Set up**:
   - App permissions: **Read and write**
   - Type of App: **Confidential client**
   - Callback URI: `https://doodstream.vercel.app/api/twitter/callback`
     (ganti `doodstream.vercel.app` dengan URL Vercel kamu nanti)
   - Website URL: `https://doodstream.vercel.app`
   - Save
8. Setelah save, copy:
   - **OAuth 2.0 Client ID** → `TWITTER_CLIENT_ID`
   - **OAuth 2.0 Client Secret** → `TWITTER_CLIENT_SECRET`

---

## 📋 STEP 3: Generate CRON_SECRET

Generate random string 32 karakter. Pilih salah satu cara:

**Cara A — Online generator:**
- Buka https://www.random.org/strings/?num=1&len=32&digits=on&upperalpha=on&loweralpha=on&unique=on&format=plain&rnd=new
- Copy hasilnya

**Cara B — Terminal (Mac/Linux):**
```bash
openssl rand -base64 32
```

**Cara C — Online lain:**
https://generate-secret.now.sh/32

Hasil random string itu dipakai di KEDUA env var: `CRON_SECRET` & `NEXT_PUBLIC_CRON_SECRET` (sama persis).

---

## 📋 STEP 4: Setup Database Tables

Ada 2 cara — pilih salah satu:

### Cara A: Pakai Script Otomatis (RECOMMENDED, 1 menit)

1. Clone repo di komputer lokal:
   ```bash
   git clone https://github.com/ojokesusu/twitterdoodstream.git
   cd twitterdoodstream
   npm install
   ```

2. Bikin file `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

3. Isi `.env.local` dengan values dari STEP 1, 2, 3

4. Run script:
   ```bash
   npx tsx scripts/init-database.ts
   ```

5. Output yang diharapkan:
   ```
   🚀 Init database di schema "twitterdood"...
   ✓ Schema "twitterdood" ready
   ✓ team_members
   ✓ attendance
   ... (banyak baris)
   ✅ Database init selesai!
   Default login: admin / admin123
   ```

### Cara B: Manual via Supabase SQL Editor

Kalau gak mau install Node.js lokal, copy-paste manual:

1. Buka Supabase project → **SQL Editor**
2. Klik **New Query**
3. Copy isi file `scripts/init-database.ts` baris yang berisi `CREATE TABLE` saja
   - Atau lebih mudah: clone repo lokal, run script (Cara A)

---

## 📋 STEP 5: Deploy ke Vercel (3 menit)

1. Buka https://vercel.com/new
2. Pilih **Import Git Repository**
3. Pilih `ojokesusu/twitterdoodstream` → branch `main`
4. Konfigurasi:
   - **Project Name**: `doodstream` (atau bebas)
   - **Framework Preset**: Next.js (auto-detect)
   - **Root Directory**: `./` (default)
5. **EXPAND "Environment Variables"** ⚠⚠⚠ — **JANGAN SKIP INI!**
6. Klik tombol **Bulk Edit** atau add satu per satu, paste:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   PG_HOST=aws-0-ap-southeast-1.pooler.supabase.com
   PG_PORT=6543
   PG_DATABASE=postgres
   PG_USER=postgres.your_project_ref
   PG_PASSWORD=your_db_password_here
   CRON_SECRET=your_random_32_char_string
   NEXT_PUBLIC_CRON_SECRET=your_random_32_char_string
   TWITTER_CLIENT_ID=your_client_id
   TWITTER_CLIENT_SECRET=your_client_secret
   TWITTER_API_KEY=your_api_key
   TWITTER_API_SECRET=your_api_secret
   TWITTER_BEARER_TOKEN=your_bearer_token
   TWITTER_CALLBACK_URL=https://doodstream.vercel.app/api/twitter/callback
   ```

   Ganti semua value `your_xxx` dengan hasil dari STEP 1, 2, 3.

7. Klik **Deploy** → tunggu 3-5 menit

---

## 📋 STEP 6: Update Twitter Callback (kalau URL Vercel beda)

Vercel akan kasih URL seperti `doodstream-xxxx.vercel.app` (random suffix). Kalau beda dengan yang di STEP 2:

1. Update env var di Vercel: `TWITTER_CALLBACK_URL` → URL Vercel sebenarnya
2. Update juga di Twitter Developer Portal:
   - https://developer.twitter.com/en/portal/projects-and-apps → app kamu → User authentication settings → Edit
   - Tambah callback URL Vercel ke daftar
3. Re-deploy di Vercel (Settings → Deployments → klik 3 titik → Redeploy)

---

## 📋 STEP 7: Login & Setup Admin (2 menit)

1. Buka URL Vercel kamu (e.g. `https://doodstream.vercel.app`)
2. Login default:
   - Username: `admin`
   - Password: `admin123`
3. **WAJIB**: ke menu **Settings** → ganti password admin
4. Tambah anggota tim di menu **Team Members**

---

## 📋 STEP 8: Setup Auto Post Cron (Opsional)

Vercel Hobby cuma support cron daily. Untuk hourly fire schedule:

1. Daftar gratis di https://cron-job.org
2. Klik **Create cronjob**
3. Title: `Doodstream Auto Post`
4. URL: `https://doodstream.vercel.app/api/cron/auto-post?key=<CRON_SECRET>`
   (ganti `<CRON_SECRET>` dengan value dari env var)
5. Schedule: Every hour
6. Save → cron jalan tiap jam fire scheduled posts

---

## ✅ Selesai!

Dashboard kamu sekarang live. Anggota tim tinggal:
1. Login di dashboard
2. Connect akun Twitter mereka di **Auto Post → Twitter → Connect**
3. Mulai bulk post / schedule

---

## 🐛 Troubleshooting

### Build error: `supabaseUrl is required`
- Env vars tidak ke-set di Vercel
- **Solusi**: Vercel project Settings → Environment Variables → tambah semua var dari STEP 5 → Redeploy

### Database error: `relation "twitterdood.xxx" does not exist`
- Tabel belum dibikin
- **Solusi**: jalankan `npx tsx scripts/init-database.ts` lagi

### Twitter OAuth error: `redirect_uri_mismatch`
- Callback URL di env tidak match dengan yang di Twitter Dev Portal
- **Solusi**: pastikan keduanya sama persis (termasuk `https://`, trailing slash, dll)

### `pg` connection error: `tenant identifier`
- Salah pakai port 5432 (direct), harus 6543 (pooler)
- **Solusi**: cek env `PG_PORT=6543` dan `PG_USER=postgres.<project_ref>`

---

## 📞 Bantuan

Stuck di langkah mana? Screenshot error → kirim ke chat, akan dibantu debug.
