-- Jalankan sekali di Supabase SQL Editor
-- Tabel untuk Telegram auto-post per anggota

create table if not exists telegram_connections (
  id bigserial primary key,
  owner_name text not null,
  bot_token text not null,
  chat_id text not null,
  chat_title text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table telegram_connections enable row level security;
drop policy if exists "telegram_connections_all" on telegram_connections;
create policy "telegram_connections_all" on telegram_connections for all using (true) with check (true);

-- Generic social post history (selain twitter_posts yang sudah ada)
create table if not exists social_posts (
  id bigserial primary key,
  platform text not null,
  posted_by text,
  target_owner text,
  content text,
  media_type text,
  external_id text,
  status text default 'posted',
  error text,
  created_at timestamptz default now()
);
alter table social_posts enable row level security;
drop policy if exists "social_posts_all" on social_posts;
create policy "social_posts_all" on social_posts for all using (true) with check (true);
