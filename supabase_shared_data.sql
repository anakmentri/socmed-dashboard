-- =====================================================================
-- JALANKAN INI DI SUPABASE SQL EDITOR SEKALI SAJA
-- (Dashboard → SQL Editor → paste semua ini → RUN)
-- Tabel-tabel ini membuat data tersimpan di cloud, bukan di browser
-- =====================================================================

-- 1. TEAM MEMBERS (anggota tim + login credentials)
create table if not exists team_members (
  id bigserial primary key,
  username text unique not null,
  password text not null,
  name text not null,
  role text,
  color text,
  platforms jsonb default '[]',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table team_members enable row level security;
drop policy if exists "team_members_all" on team_members;
create policy "team_members_all" on team_members for all using (true) with check (true);

-- 2. ATTENDANCE (kehadiran per tanggal per anggota)
create table if not exists attendance (
  id bigserial primary key,
  date text not null,
  name text not null,
  status text not null default 'kerja',
  note text default '',
  updated_at timestamptz default now(),
  unique(date, name)
);
alter table attendance enable row level security;
drop policy if exists "attendance_all" on attendance;
create policy "attendance_all" on attendance for all using (true) with check (true);

-- 3. BANNED ACCOUNTS (tandai akun banned)
create table if not exists banned_accounts (
  account_id bigint primary key,
  banned_at timestamptz default now()
);
alter table banned_accounts enable row level security;
drop policy if exists "banned_accounts_all" on banned_accounts;
create policy "banned_accounts_all" on banned_accounts for all using (true) with check (true);

-- 4. ACTIVITY LOG (riwayat aktivitas admin & anggota)
create table if not exists activity_log (
  id bigserial primary key,
  who text,
  role text,
  action text,
  source text,
  detail text,
  created_at timestamptz default now()
);
alter table activity_log enable row level security;
drop policy if exists "activity_log_all" on activity_log;
create policy "activity_log_all" on activity_log for all using (true) with check (true);

-- 5. Seed 9 anggota default ke team_members (jika tabel kosong)
insert into team_members (username, password, name, role, color, platforms)
select * from (values
  ('tlegu', 'tlegu123', 'Tlegu', 'Team Leader', '#38bdf8', '["Instagram","X (Twitter)","TikTok"]'::jsonb),
  ('rully', 'rully123', 'Rully', 'Editor Video', '#ec4899', '["YouTube","TikTok"]'::jsonb),
  ('aprianto', 'aprianto123', 'Aprianto', 'Video Editor', '#a78bfa', '["YouTube","TikTok"]'::jsonb),
  ('meyji', 'meyji123', 'Meyji', 'Social Media Specialist', '#34d399', '["Instagram","Facebook"]'::jsonb),
  ('yanto', 'yanto123', 'Yanto', 'Graphic Designer', '#fb923c', '["Instagram"]'::jsonb),
  ('savanda', 'savanda123', 'Savanda', 'Graphic Designer', '#fbbf24', '["Instagram"]'::jsonb),
  ('faisol', 'faisol123', 'Faisol', 'Content Creator', '#f87171', '["X (Twitter)","Telegram"]'::jsonb),
  ('wahyudi', 'wahyudi123', 'Wahyudi', 'Social Media Specialist', '#06b6d4', '["Instagram","Facebook","X (Twitter)"]'::jsonb),
  ('soir', 'soir123', 'Soir', 'Content Creator', '#10b981', '["TikTok","Telegram"]'::jsonb)
) as t (username, password, name, role, color, platforms)
where not exists (select 1 from team_members);
