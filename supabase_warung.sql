-- =====================================================================
-- JALANKAN SEKALI DI SUPABASE SQL EDITOR
-- (Dashboard → SQL Editor → paste semua → RUN)
-- Tabel ini khusus untuk dashboard /warung — TERPISAH dari tabel lain
-- (team_members, attendance, twitter_*, dll tetap utuh, tidak disentuh)
-- =====================================================================

-- 1. WARUNG_ITEMS (daftar barang warung: nama, modal, jual, stok, terjual)
create table if not exists warung_items (
  id bigserial primary key,
  nama text not null,
  satuan text not null default 'pcs',
  modal integer not null default 0,
  jual integer not null default 0,
  stok integer not null default 0,
  terjual integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table warung_items enable row level security;
drop policy if exists "warung_items_all" on warung_items;
create policy "warung_items_all" on warung_items for all using (true) with check (true);

-- 2. WARUNG_SALES (riwayat transaksi jualan — opsional, buat histori)
create table if not exists warung_sales (
  id bigserial primary key,
  item_id bigint references warung_items(id) on delete set null,
  nama text not null,
  qty integer not null,
  modal integer not null,
  jual integer not null,
  untung integer not null,
  created_at timestamptz default now()
);

alter table warung_sales enable row level security;
drop policy if exists "warung_sales_all" on warung_sales;
create policy "warung_sales_all" on warung_sales for all using (true) with check (true);

-- 3. Seed data awal (hanya kalau tabel masih kosong)
insert into warung_items (nama, satuan, modal, jual, stok, terjual)
select * from (values
  ('Kopi Sachet',      'bks',   1200,  2000, 150, 0),
  ('Gorengan Tempe',   'pcs',    700,  1500,  60, 0),
  ('Nasi Bungkus',     'pcs',   8000, 12000,  25, 0),
  ('Teh Botol',        'btl',   3800,  5000,  48, 0),
  ('Rokok Ketengan',   'btg',   1800,  2500, 200, 0),
  ('Mie Rebus',        'porsi', 4500,  8000,  30, 0),
  ('Es Teh',           'gls',   1500,  4000,  80, 0),
  ('Kerupuk',          'bks',    600,  1000, 120, 0)
) as t (nama, satuan, modal, jual, stok, terjual)
where not exists (select 1 from warung_items);
