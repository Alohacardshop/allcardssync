-- Check if catalog_v2 schema exists and create missing tables
create schema if not exists catalog_v2;

-- Create catalog_v2 tables if they don't exist
create table if not exists catalog_v2.sets (
  provider text not null default 'justtcg',
  set_id text not null,
  provider_id text,
  game text not null,
  name text not null,
  series text,
  printed_total int,
  total int,
  release_date date,
  images jsonb,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_from_source_at timestamptz not null default now(),
  primary key (provider, set_id)
);

create table if not exists catalog_v2.cards (
  provider text not null default 'justtcg',
  card_id text not null,
  game text not null,
  set_id text not null,
  name text not null,
  number text,
  rarity text,
  supertype text,
  subtypes text[],
  images jsonb,
  tcgplayer_product_id bigint,
  tcgplayer_url text,
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_from_source_at timestamptz not null default now(),
  primary key (provider, card_id)
);

create table if not exists catalog_v2.variants (
  provider text not null default 'justtcg',
  variant_id text,
  card_id text not null,
  game text not null,
  variant_key text not null,  -- We'll compute this in application code
  language text,
  printing text,
  condition text,
  sku text,
  price decimal(10,2),
  market_price decimal(10,2),
  low_price decimal(10,2),
  mid_price decimal(10,2),
  high_price decimal(10,2),
  currency text default 'USD',
  data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_from_source_at timestamptz not null default now(),
  primary key (provider, variant_key)
);

-- Add indexes for performance
create index if not exists idx_catalog_v2_cards_game on catalog_v2.cards(game);
create index if not exists idx_catalog_v2_variants_game on catalog_v2.variants(game);
create index if not exists idx_catalog_v2_variants_card_id on catalog_v2.variants(card_id);

-- Add some sample data for testing if tables are empty
do $$
begin
  if not exists (select 1 from catalog_v2.cards limit 1) then
    -- Insert sample Pokemon cards for testing
    insert into catalog_v2.sets (set_id, game, name) values
      ('sv1', 'pokemon', 'Scarlet & Violet'),
      ('sv2', 'pokemon', 'Paldea Evolved'),
      ('mtg-dmu', 'mtg', 'Dominaria United');
    
    insert into catalog_v2.cards (card_id, game, set_id, name, number) values
      ('sv1-001', 'pokemon', 'sv1', 'Sprigatito', '001'),
      ('sv1-002', 'pokemon', 'sv1', 'Floragato', '002'),
      ('sv2-001', 'pokemon', 'sv2', 'Charmander', '001'),
      ('dmu-001', 'mtg', 'mtg-dmu', 'Lightning Bolt', '001');
      
    -- Insert sample variants
    insert into catalog_v2.variants (variant_key, card_id, game, language, printing, condition, price, market_price) values
      ('sv1-001-en-1st-nm', 'sv1-001', 'pokemon', 'English', '1st Edition', 'Near Mint', 5.99, 6.50),
      ('sv1-002-en-1st-nm', 'sv1-002', 'pokemon', 'English', '1st Edition', 'Near Mint', 12.99, 14.00),
      ('sv2-001-en-1st-nm', 'sv2-001', 'pokemon', 'English', '1st Edition', 'Near Mint', 3.99, 4.25),
      ('dmu-001-en-reg-nm', 'dmu-001', 'mtg', 'English', 'Regular', 'Near Mint', 0.25, 0.30);
  end if;
end $$;