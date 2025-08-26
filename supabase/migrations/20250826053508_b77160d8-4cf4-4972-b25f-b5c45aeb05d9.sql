
-- 1) Create schema
create schema if not exists catalog_v2;

-- 2) Sets table
create table if not exists catalog_v2.sets (
  id text primary key,
  game text not null,                -- e.g. 'mtg', 'pokemon_japan'
  name text not null,
  series text,
  printed_total integer,
  total integer,
  release_date date,
  images jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) Cards table
create table if not exists catalog_v2.cards (
  id text primary key,
  game text not null,
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Sync errors table (used by catalog_v2_log_error and UI)
create table if not exists catalog_v2.sync_errors (
  id uuid primary key default gen_random_uuid(),
  game text not null,            -- 'mtg', 'pokemon', 'pokemon_japan'
  set_id text,                   -- optional: set id that failed
  step text,                     -- e.g., 'orchestrate_sets', 'sync_cards_page'
  message text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

-- 5) Helpful indexes
create index if not exists idx_sets_game on catalog_v2.sets(game);
create index if not exists idx_cards_game on catalog_v2.cards(game);
create index if not exists idx_cards_set on catalog_v2.cards(set_id);
create index if not exists idx_cards_tcgplayer_product_id on catalog_v2.cards(tcgplayer_product_id);

-- Trigram index to speed ILIKE name lookups used by catalog-search
-- pg_trgm functions exist in this project, so this should succeed
create index if not exists idx_cards_name_trgm on catalog_v2.cards using gin (name gin_trgm_ops);

-- 6) RLS (secured by default; RPCs/Edge functions use service role or SECURITY DEFINER)
alter table catalog_v2.sets enable row level security;
alter table catalog_v2.cards enable row level security;
alter table catalog_v2.sync_errors enable row level security;

-- 7) updated_at triggers for sets and cards
drop trigger if exists trg_sets_updated_at on catalog_v2.sets;
create trigger trg_sets_updated_at
before update on catalog_v2.sets
for each row execute function public.update_updated_at_column();

drop trigger if exists trg_cards_updated_at on catalog_v2.cards;
create trigger trg_cards_updated_at
before update on catalog_v2.cards
for each row execute function public.update_updated_at_column();
