-- =====================================================================
-- JALANKAN INI SEKALI DI SUPABASE SQL EDITOR
-- Fix: allow 1 user punya BANYAK akun Twitter (bukan 1 per user)
-- =====================================================================

-- 1. Drop UNIQUE constraint lama pada owner_name
alter table twitter_connections drop constraint if exists twitter_connections_owner_name_key;

-- 2. Buat composite unique (owner_name + twitter_user_id)
-- Artinya: tiap user bisa punya banyak akun Twitter,
-- tapi tidak bisa connect akun Twitter yang SAMA dua kali
drop index if exists twitter_connections_owner_tw_uid_idx;
create unique index twitter_connections_owner_tw_uid_idx
  on twitter_connections (owner_name, twitter_user_id)
  where twitter_user_id is not null;

-- 3. Verify — lihat constraint yang tersisa
-- (hasil harusnya cuma primary key + composite unique index)
select conname, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
where t.relname = 'twitter_connections';
