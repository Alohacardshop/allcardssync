-- Ensure schema exists
create schema if not exists catalog_v2;

-- Add a small enum-like constraint for game
create table if not exists catalog_v2.games (key text primary key);
insert into catalog_v2.games(key) values ('pokemon') on conflict do nothing;
insert into catalog_v2.games(key) values ('pokemon_japan') on conflict do nothing;
insert into catalog_v2.games(key) values ('mtg') on conflict do nothing;

-- Sets
create table if not exists catalog_v2.sets (
  id text primary key,
  game text references catalog_v2.games(key) on delete restrict,
  name text not null,
  series text,
  printed_total int,
  total int,
  release_date date,
  images jsonb,
  updated_at timestamptz default now()
);

-- Cards
create table if not exists catalog_v2.cards (
  id text primary key,
  game text references catalog_v2.games(key) on delete restrict,
  name text not null,
  number text,
  set_id text references catalog_v2.sets(id) on delete cascade,
  rarity text,
  supertype text,
  subtypes text[],
  images jsonb,
  tcgplayer_product_id bigint,
  tcgplayer_url text,
  data jsonb,
  updated_at timestamptz default now()
);

-- Indexes
create extension if not exists pg_trgm;
create index if not exists catalog_v2_cards_game_idx on catalog_v2.cards(game);
create index if not exists catalog_v2_cards_name_trgm on catalog_v2.cards using gin (name gin_trgm_ops);
create index if not exists catalog_v2_cards_num_idx on catalog_v2.cards(number);
create index if not exists catalog_v2_cards_set_idx on catalog_v2.cards(set_id);
create index if not exists catalog_v2_cards_tcgpid_idx on catalog_v2.cards(tcgplayer_product_id);

-- Enable RLS on new tables
alter table catalog_v2.games enable row level security;
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;

-- Public read access for catalog data
create policy "Public read access" on catalog_v2.games for select using (true);
create policy "Public read access" on catalog_v2.sets for select using (true);
create policy "Public read access" on catalog_v2.cards for select using (true);

-- Admin write access
create policy "Admin write access" on catalog_v2.games for all using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin write access" on catalog_v2.sets for all using (has_role(auth.uid(), 'admin'::app_role));
create policy "Admin write access" on catalog_v2.cards for all using (has_role(auth.uid(), 'admin'::app_role));