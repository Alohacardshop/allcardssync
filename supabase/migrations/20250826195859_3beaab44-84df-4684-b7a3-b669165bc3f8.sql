-- Create catalog_v2 schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS catalog_v2;

-- Drop existing tables to recreate with proper structure
DROP TABLE IF EXISTS catalog_v2.cards CASCADE;
DROP TABLE IF EXISTS catalog_v2.sets CASCADE;
DROP TABLE IF EXISTS catalog_v2.variants CASCADE;
DROP TABLE IF EXISTS catalog_v2.sync_errors CASCADE;

-- Create sets table with authoritative IDs
CREATE TABLE catalog_v2.sets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    set_id TEXT NOT NULL,
    game TEXT NOT NULL,
    name TEXT,
    series TEXT,
    printed_total INTEGER,
    total INTEGER,
    release_date DATE,
    images JSONB,
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + set_id
    CONSTRAINT unique_provider_set_id UNIQUE (provider, set_id)
);

-- Create cards table with authoritative IDs  
CREATE TABLE catalog_v2.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    card_id TEXT NOT NULL,
    game TEXT NOT NULL,
    set_id TEXT NOT NULL,
    name TEXT,
    number TEXT,
    rarity TEXT,
    supertype TEXT,
    subtypes TEXT[],
    images JSONB,
    tcgplayer_product_id BIGINT,
    tcgplayer_url TEXT,
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + card_id
    CONSTRAINT unique_provider_card_id UNIQUE (provider, card_id),
    
    -- Foreign key to sets table
    CONSTRAINT fk_cards_set_id FOREIGN KEY (provider, set_id) REFERENCES catalog_v2.sets(provider, set_id) ON DELETE CASCADE
);

-- Create variants table with authoritative IDs
CREATE TABLE catalog_v2.variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    variant_id TEXT,
    variant_key TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN variant_id IS NOT NULL THEN variant_id
            ELSE encode(sha256((card_id || '|' || COALESCE(language, '') || '|' || COALESCE(printing, '') || '|' || COALESCE(condition, '') || '|' || COALESCE(sku, ''))::bytea), 'hex')
        END
    ) STORED,
    card_id TEXT NOT NULL,
    game TEXT NOT NULL,
    language TEXT,
    printing TEXT,
    condition TEXT,
    sku TEXT,
    price DECIMAL(10,2),
    market_price DECIMAL(10,2),
    low_price DECIMAL(10,2),
    mid_price DECIMAL(10,2),
    high_price DECIMAL(10,2),
    currency TEXT DEFAULT 'USD',
    data JSONB,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_from_source_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on provider + variant_key (derived from variant_id or hash)
    CONSTRAINT unique_provider_variant_key UNIQUE (provider, variant_key),
    
    -- Foreign key to cards table
    CONSTRAINT fk_variants_card_id FOREIGN KEY (provider, card_id) REFERENCES catalog_v2.cards(provider, card_id) ON DELETE CASCADE
);

-- Recreate sync_errors table with provider support
CREATE TABLE catalog_v2.sync_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL DEFAULT 'justtcg',
    game TEXT NOT NULL,
    set_id TEXT,
    card_id TEXT,
    step TEXT NOT NULL,
    message TEXT NOT NULL,
    detail JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create performance indexes
CREATE INDEX idx_sets_provider_game ON catalog_v2.sets (provider, game);
CREATE INDEX idx_sets_set_id ON catalog_v2.sets (set_id);
CREATE INDEX idx_sets_last_seen_at ON catalog_v2.sets (last_seen_at);
CREATE INDEX idx_sets_updated_from_source_at ON catalog_v2.sets (updated_from_source_at);

CREATE INDEX idx_cards_provider_game ON catalog_v2.cards (provider, game);
CREATE INDEX idx_cards_card_id ON catalog_v2.cards (card_id);
CREATE INDEX idx_cards_set_id ON catalog_v2.cards (set_id);
CREATE INDEX idx_cards_last_seen_at ON catalog_v2.cards (last_seen_at);
CREATE INDEX idx_cards_updated_from_source_at ON catalog_v2.cards (updated_from_source_at);

CREATE INDEX idx_variants_provider_game ON catalog_v2.variants (provider, game);
CREATE INDEX idx_variants_card_id ON catalog_v2.variants (card_id);
CREATE INDEX idx_variants_variant_key ON catalog_v2.variants (variant_key);
CREATE INDEX idx_variants_last_seen_at ON catalog_v2.variants (last_seen_at);
CREATE INDEX idx_variants_updated_from_source_at ON catalog_v2.variants (updated_from_source_at);

CREATE INDEX idx_sync_errors_provider_game ON catalog_v2.sync_errors (provider, game);
CREATE INDEX idx_sync_errors_created_at ON catalog_v2.sync_errors (created_at);

-- Update the upsert functions to work with new schema
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_sets(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.sets (
    provider, set_id, game, name, series, printed_total, total, release_date, images, data, updated_from_source_at
  )
  SELECT
    COALESCE(r->>'provider', 'justtcg')::text,
    (r->>'set_id')::text,
    (r->>'game')::text,
    (r->>'name')::text,
    nullif(r->>'series',''),
    nullif(r->>'printed_total','')::int,
    nullif(r->>'total','')::int,
    -- SAFE DATE PARSE:
    case
      when coalesce(r->>'release_date','') = '' then null
      when (r->>'release_date') ~ '^\d{4}/\d{2}/\d{2}$'
        then to_date(r->>'release_date', 'YYYY/MM/DD')
      when (r->>'release_date') ~ '^\d{4}-\d{2}-\d{2}$'
        then to_date(r->>'release_date', 'YYYY-MM-DD')
      else null
    end as release_date,
    (r->>'images')::jsonb,
    (r->>'data')::jsonb,
    now()
  FROM jsonb_array_elements(rows) as r
  ON CONFLICT (provider, set_id) DO UPDATE
  SET game = excluded.game,
      name = excluded.name,
      series = excluded.series,
      printed_total = excluded.printed_total,
      total = excluded.total,
      release_date = excluded.release_date,
      images = excluded.images,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();
END
$function$;

CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Use a CTE to deduplicate by card_id, keeping the last occurrence
  WITH deduplicated AS (
    SELECT DISTINCT ON ((r->>'card_id')::text)
      COALESCE(r->>'provider', 'justtcg')::text as provider,
      (r->>'card_id')::text as card_id,
      (r->>'game')::text as game,
      (r->>'set_id')::text as set_id,
      (r->>'name')::text as name,
      nullif(r->>'number','') as number,
      nullif(r->>'rarity','') as rarity,
      nullif(r->>'supertype','') as supertype,
      case
        when (r ? 'subtypes') and jsonb_typeof(r->'subtypes') = 'array' then
          (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(r->'subtypes') as x)
        else null
      end::text[] as subtypes,
      (r->>'images')::jsonb as images,
      nullif(r->>'tcgplayer_product_id','')::bigint as tcgplayer_product_id,
      r->>'tcgplayer_url' as tcgplayer_url,
      (r->>'data')::jsonb as data,
      now() as updated_from_source_at
    FROM jsonb_array_elements(rows) as r
    ORDER BY (r->>'card_id')::text, ordinality DESC  -- Keep last occurrence
  )
  INSERT INTO catalog_v2.cards (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM deduplicated
  ON CONFLICT (provider, card_id) DO UPDATE
  SET game = excluded.game,
      set_id = excluded.set_id,
      name = excluded.name,
      number = excluded.number,
      rarity = excluded.rarity,
      supertype = excluded.supertype,
      subtypes = excluded.subtypes,
      images = excluded.images,
      tcgplayer_product_id = excluded.tcgplayer_product_id,
      tcgplayer_url = excluded.tcgplayer_url,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();
END
$function$;

-- Create new function for upserting variants
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_variants(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.variants (
    provider, variant_id, card_id, game, language, printing, condition, sku,
    price, market_price, low_price, mid_price, high_price, currency, data, updated_from_source_at
  )
  SELECT
    COALESCE(r->>'provider', 'justtcg')::text,
    nullif(r->>'variant_id', ''),
    (r->>'card_id')::text,
    (r->>'game')::text,
    nullif(r->>'language', ''),
    nullif(r->>'printing', ''),
    nullif(r->>'condition', ''),
    nullif(r->>'sku', ''),
    nullif(r->>'price', '')::decimal(10,2),
    nullif(r->>'market_price', '')::decimal(10,2),
    nullif(r->>'low_price', '')::decimal(10,2),
    nullif(r->>'mid_price', '')::decimal(10,2),
    nullif(r->>'high_price', '')::decimal(10,2),
    COALESCE(nullif(r->>'currency', ''), 'USD'),
    (r->>'data')::jsonb,
    now()
  FROM jsonb_array_elements(rows) as r
  ON CONFLICT (provider, variant_key) DO UPDATE
  SET language = excluded.language,
      printing = excluded.printing,
      condition = excluded.condition,
      sku = excluded.sku,
      price = excluded.price,
      market_price = excluded.market_price,
      low_price = excluded.low_price,
      mid_price = excluded.mid_price,
      high_price = excluded.high_price,
      currency = excluded.currency,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();
END
$function$;

-- Update stats function to work with new schema
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
RETURNS TABLE(sets_count bigint, cards_count bigint, pending_sets bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*) FROM catalog_v2.sets s WHERE s.game = game_in) as sets_count,
    (SELECT count(*) FROM catalog_v2.cards c WHERE c.game = game_in) as cards_count,
    (SELECT count(*) FROM (
       SELECT s.set_id
       FROM catalog_v2.sets s
       LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND c.game = game_in
       WHERE s.game = game_in
       GROUP BY s.set_id
       HAVING count(c.id) = 0
    ) x) as pending_sets
$function$;

-- Update error logging function
CREATE OR REPLACE FUNCTION public.catalog_v2_log_error(payload jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.sync_errors (provider, game, set_id, card_id, step, message, detail)
  VALUES (
    COALESCE(payload->>'provider', 'justtcg'), 
    payload->>'game', 
    payload->>'set_id', 
    payload->>'card_id',
    payload->>'step', 
    payload->>'message', 
    payload->'detail'
  );
END
$function$;

-- Update error retrieval function
CREATE OR REPLACE FUNCTION public.catalog_v2_get_recent_sync_errors(game_in text DEFAULT 'pokemon'::text, limit_in integer DEFAULT 20)
RETURNS TABLE(set_id text, card_id text, step text, message text, created_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT se.set_id, se.card_id, se.step, se.message, se.created_at
  FROM catalog_v2.sync_errors se
  WHERE se.game = game_in
  ORDER BY se.created_at DESC
  LIMIT limit_in;
$function$;

-- Function to get sets needing incremental sync
CREATE OR REPLACE FUNCTION public.catalog_v2_get_stale_sets(game_in text, since_timestamp timestamptz)
RETURNS TABLE(set_id text, name text, last_seen_at timestamptz)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.set_id, s.name, s.last_seen_at
  FROM catalog_v2.sets s
  WHERE s.game = game_in 
  AND s.last_seen_at < since_timestamp
  ORDER BY s.last_seen_at ASC;
$function$;