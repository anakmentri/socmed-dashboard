-- JALANKAN DI SUPABASE SQL EDITOR SEKALI SAJA
-- Tabel untuk simpan token Twitter OAuth 2.0 + riwayat post

create table if not exists twitter_connections (
  id bigserial primary key,
  owner_name text not null,
  twitter_user_id text,
  twitter_username text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table twitter_connections enable row level security;
drop policy if exists "twitter_connections_all" on twitter_connections;
create policy "twitter_connections_all" on twitter_connections for all using (true) with check (true);

create table if not exists twitter_posts (
  id bigserial primary key,
  connection_id bigint references twitter_connections(id) on delete cascade,
  posted_by text,
  tweet_id text,
  text_content text,
  media_url text,
  status text default 'posted',
  error text,
  created_at timestamptz default now()
);
alter table twitter_posts enable row level security;
drop policy if exists "twitter_posts_all" on twitter_posts;
create policy "twitter_posts_all" on twitter_posts for all using (true) with check (true);

-- Tabel sementara untuk OAuth PKCE state verification
create table if not exists twitter_oauth_states (
  state text primary key,
  code_verifier text not null,
  owner_name text,
  created_at timestamptz default now()
);
alter table twitter_oauth_states enable row level security;
drop policy if exists "twitter_oauth_states_all" on twitter_oauth_states;
create policy "twitter_oauth_states_all" on twitter_oauth_states for all using (true) with check (true);
