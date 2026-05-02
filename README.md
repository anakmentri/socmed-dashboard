# Tim Dashboard — Next.js Edition

Versi Next.js + React + Tailwind CSS dari dashboard sosial media tim, dengan Supabase PostgreSQL sebagai database.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **React 18**
- **Tailwind CSS 3** (dark theme)
- **Supabase JS v2** (PostgreSQL + REST API)

## Menjalankan di lokal

```bash
cd C:\Users\user210\Downloads\dashboard-next
npm install
npm run dev
```

Buka `http://localhost:3000` di browser.

## Kredensial login

**Admin**
- Username: `admin` / Password: `admin123`

**Anggota**
- `tlegu` / `tlegu123`
- `rully` / `rully123`
- `aprianto` / `aprianto123`
- `meyji` / `meyji123`
- `yanto` / `yanto123`
- `savanda` / `savanda123`
- `faisol` / `faisol123`
- `wahyudi` / `wahyudi123`
- `soir` / `soir123`

## Struktur project

```
dashboard-next/
├── app/
│   ├── layout.tsx             # Root HTML layout
│   ├── page.tsx               # Redirect ke /login atau /dashboard
│   ├── globals.css            # Tailwind + custom toast styles
│   ├── login/page.tsx         # Halaman login
│   └── dashboard/
│       ├── layout.tsx         # Sidebar wrapper + auth gate
│       ├── page.tsx           # Overview
│       ├── platforms/page.tsx # Kelola Platform
│       ├── content/page.tsx   # Pengerjaan harian
│       ├── input-report/page.tsx
│       ├── report/page.tsx    # Report (post / komentar)
│       ├── accounts/page.tsx  # Akun sosmed
│       ├── assets/page.tsx    # Asset library
│       ├── history/page.tsx   # Activity log
│       └── settings/page.tsx
├── components/
│   ├── Sidebar.tsx            # Nav sidebar
│   ├── Header.tsx             # Top header (user + logout)
│   ├── PageShell.tsx          # Page wrapper (header + content)
│   ├── DateNav.tsx            # ◀/▶ date picker
│   ├── Modal.tsx              # Modal + FormRow + Field
│   └── Toast.tsx              # Toast context provider
├── hooks/
│   └── useSession.ts          # Auth session hook
├── lib/
│   ├── supabase.ts            # Supabase client
│   ├── types.ts               # TypeScript types per tabel
│   ├── auth.ts                # Login / session helpers
│   └── utils.ts               # Helper (fN, fmtIdDate, pack/unpack)
├── .env.local                 # Supabase URL + anon key
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## Database

Dashboard ini menggunakan tabel Supabase yang sudah ada:

| Tabel | Fungsi |
|---|---|
| `daily_work` | Pengerjaan harian |
| `report_items` | Report (field lengkap dipack JSON di kolom `content`) |
| `ir_data` | Input report realisasi & output |
| `soc_accounts` | Akun sosmed per anggota |
| `assets` | Asset library (image base64 dipack di `url`) |
| `platforms` | Daftar platform sosmed |
| `activity_log` | History aktivitas |

Skema tabel ada di file `supabase_setup.sql` (project lama). Sudah tersedia di Supabase.

## Deploy ke Vercel

1. Push folder ini ke GitHub (repo baru)
2. Buka https://vercel.com → New Project → Import repo
3. Environment variables (otomatis dibaca dari `.env.local` tapi harus diset juga di Vercel):
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://fireqxxqxxkxbcemcpmj.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (isi anon key dari `.env.local`)
4. Klik Deploy

Vercel akan otomatis build dan deploy. Setiap push ke main branch akan trigger deploy baru.

### Alternatif: Cloudflare Pages / Netlify

Sama-sama support Next.js out of the box. Pilih apa saja yang Anda suka.

## Fitur

- ✅ Login admin + anggota (hardcoded credentials)
- ✅ Role-based navigation (anggota cuma lihat menu yang relevan)
- ✅ Overview dengan ringkasan per anggota
- ✅ Platform management (CRUD)
- ✅ Pengerjaan harian dengan filter tanggal + status inline
- ✅ Input report (realisasi/output) dengan filter tanggal
- ✅ Report kerjaan dengan tipe Post / Komentar + multi-link
- ✅ Akun sosmed dengan toggle show/hide password
- ✅ Asset library foto/video dengan copy caption/link
- ✅ History dengan group per tanggal + filter user/tanggal
- ✅ Semua data di Supabase PostgreSQL (tidak ada localStorage untuk data)

## Catatan

- Session (auth) masih pakai localStorage — ini wajar untuk "remember me".
- Image base64 asset dibatasi 2 MB supaya aman di kolom TEXT Supabase.
- Field extra report (`links`, `image`, `notes`) dipack JSON ke kolom `content` agar tidak perlu ALTER TABLE.
Test1
Test 2
Test3
Test 4
