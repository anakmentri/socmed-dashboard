-- Jalankan sekali di Supabase SQL Editor
-- Menambahkan kolom verify_link untuk simpan link verifikasi akun (mis. link konfirmasi email Twitter)

alter table soc_accounts add column if not exists verify_link text default '';
