
-- 1) Create schema
create schema if not exists catalog_v2;

-- Important: allow REST roles to access the schema/tables for reading (RLS still applies)
grant usage on schema catalog_v2 to anon, authenticated;
grant select on all tables in schema catalog_v2 to anon, authenticated;
alter default privileges in schema catalog_v2 grant select on tables to anon, authenticated;

-- 2) Tables

-- Sets table
create table if not exists catalog_v2.sets (
  id text primary key,
  game text not null,
  name text not null,
  series text,
  printed_total integer,
  total integer,
  -- PokemonTCG API returns releaseDate as a string; we store it as text to avoid parsing issues
  release_date text,
  images jsonb,
  updated_at timestamptz not null default now()
);

-- Cards table
create table if not exists catalog_v2.cards (
  id text primary key,
  game text not null,
  name text not null,
  number text,
  set_id text references catalog_v2.sets(id) on delete set null,
  rarity text,
  supertype text,
  subtypes jsonb,
  images jsonb,
  tcgplayer_product_id bigint,
  tcgplayer_url text,
  data jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Helpful indexes
create index if not exists idx_sets_name_lower on catalog_v2.sets ((lower(name)));
create index if not exists idx_cards_name_lower on catalog_v2.cards ((lower(name)));
create index if not exists idx_cards_set_id on catalog_v2.cards (set_id);
create index if not exists idx_cards_tcgplayer_product_id on catalog_v2.cards (tcgplayer_product_id);

-- 4) RLS: enable and allow read for authenticated users (no insert/update/delete from client)
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;

drop policy if exists "Authenticated can read sets" on catalog_v2.sets;
create policy "Authenticated can read sets"
  on catalog_v2.sets
  for select
  using (auth.uid() is not null);

drop policy if exists "Authenticated can read cards" on catalog_v2.cards;
create policy "Authenticated can read cards"
  on catalog_v2.cards
  for select
  using (auth.uid() is not null);

-- 5) Keep updated_at fresh on updates (optional but useful)
drop trigger if exists trg_sets_updated_at on catalog_v2.sets;
create trigger trg_sets_updated_at
before update on catalog_v2.sets
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_cards_updated_at on catalog_v2.cards;
create trigger trg_cards_updated_at
before update on catalog_v2.cards
for each row execute function public.update_updated_at_column();
