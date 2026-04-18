# Cara Deploy Dashboard ke Online (Vercel)

Setelah ini dashboard bisa diakses dari mana saja via URL `https://nama-kamu.vercel.app`. Data tersinkronisasi otomatis antar semua anggota.

## LANGKAH 1: Setup Tabel Supabase (HANYA SEKALI)

1. Buka https://supabase.com/dashboard/project/fireqxxqxxkxbcemcpmj/sql/new
2. Buka file `supabase_shared_data.sql` di folder ini
3. Copy semua isinya, paste ke SQL Editor di Supabase
4. Klik tombol **RUN** (kanan bawah)
5. Pastikan muncul "Success. No rows returned"

Ini akan membuat 4 tabel: `team_members`, `attendance`, `banned_accounts`, `activity_log`. Data sekarang tersimpan di cloud, bukan di browser masing-masing.

## LANGKAH 2: Push Project ke GitHub

1. Install Git: https://git-scm.com/download/win
2. Buat akun GitHub: https://github.com/signup
3. Buat repo baru di https://github.com/new (set Private), beri nama `dashboard-tim`
4. Buka PowerShell di folder `dashboard-next`, jalankan:

```powershell
git init
git add .
git commit -m "initial dashboard"
git branch -M main
git remote add origin https://github.com/USERNAME-KAMU/dashboard-tim.git
git push -u origin main
```

(ganti `USERNAME-KAMU` dengan username GitHub kamu)

## LANGKAH 3: Deploy ke Vercel

1. Buka https://vercel.com/signup → daftar pakai GitHub
2. Klik **Add New → Project**
3. Pilih repo `dashboard-tim`
4. Di bagian **Environment Variables**, tambahkan 2 variable berikut (copy dari `.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=https://fireqxxqxxkxbcemcpmj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpcmVxeHhxeHhreGJjZW1jcG1qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4MDAyMjUsImV4cCI6MjA5MTM3NjIyNX0.NNTcqbgbDRy6m95hu1K7pQi10jH52n3HUkSubUlK7sM
```

5. Klik **Deploy** → tunggu 2-3 menit
6. Selesai! URL akan tampil seperti `https://dashboard-tim-xxx.vercel.app`

## Update Dashboard di Masa Depan

Setiap kali ada perubahan kode, jalankan di PowerShell:

```powershell
git add .
git commit -m "update fitur"
git push
```

Vercel akan otomatis re-deploy dalam 1-2 menit.

## Troubleshooting

- **Login error setelah deploy**: Pastikan SQL di langkah 1 sudah dijalankan (terutama bagian seed default members)
- **Data tidak muncul**: Cek di Supabase → Table Editor → pastikan 4 tabel sudah dibuat
- **"Anggota tidak bisa login"**: Buka `/dashboard/team` sebagai admin, edit anggota, set password ulang → save (akan tersinkronisasi ke cloud)
