-- Create catalog_v2 schema and basic tables
create schema if not exists catalog_v2;

-- Simple sets table
create table if not exists catalog_v2.sets (
  provider text not null default 'justtcg',
  set_id text not null,
  provider_id text,
  game text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, set_id)
);

-- Simple cards table  
create table if not exists catalog_v2.cards (
  provider text not null default 'justtcg',
  card_id text not null,
  game text not null,
  set_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, card_id)
);

-- Simple variants table
create table if not exists catalog_v2.variants (
  provider text not null default 'justtcg',
  variant_key text not null,
  card_id text not null,
  game text not null,
  language text,
  printing text,
  condition text,
  price decimal(10,2),
  market_price decimal(10,2),
  low_price decimal(10,2),
  high_price decimal(10,2),
  currency text default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider, variant_key)
);

-- Add basic indexes
create index if not exists idx_cards_game on catalog_v2.cards(game);
create index if not exists idx_variants_game on catalog_v2.variants(game);