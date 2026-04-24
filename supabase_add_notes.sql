-- =====================================================================
-- JALANKAN SEKALI DI SUPABASE SQL EDITOR
-- Buka: https://supabase.com/dashboard/project/fireqxxqxxkxbcemcpmj/sql/new
-- Paste semua SQL di bawah → klik RUN
-- =====================================================================

-- Tambah kolom 'notes' (catatan) untuk anggota tim
alter table team_members add column if not exists notes text default '';

-- Verify (optional)
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'team_members' and column_name = 'notes';
