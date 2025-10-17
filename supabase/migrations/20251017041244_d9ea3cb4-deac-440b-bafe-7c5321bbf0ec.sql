-- Queue deduplication and structured logging (Fixed)
-- Part 1: Add job_type column and unique constraint for idempotent queueing

-- Add job_type to sync_queue if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'sync_queue' 
    AND column_name = 'job_type'
  ) THEN
    ALTER TABLE public.sync_queue ADD COLUMN job_type text NOT NULL DEFAULT 'set_sync';
  END IF;
END $$;

-- Create unique index for deduplication (prevents duplicate queued/processing jobs)
CREATE UNIQUE INDEX IF NOT EXISTS sync_queue_dedupe_idx
ON public.sync_queue (game, set_id, job_type)
WHERE status IN ('queued', 'processing');

-- Part 2: Structured logging table
CREATE TABLE IF NOT EXISTS catalog_v2.logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
  message text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS logs_request_id_idx ON catalog_v2.logs (request_id);
CREATE INDEX IF NOT EXISTS logs_created_at_idx ON catalog_v2.logs (created_at DESC);
CREATE INDEX IF NOT EXISTS logs_level_idx ON catalog_v2.logs (level);

-- Part 3: PSA image cache table for stale-while-revalidate
CREATE TABLE IF NOT EXISTS catalog_v2.psa_image_cache (
  cert text PRIMARY KEY,
  primary_url text,
  all_urls jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS psa_image_cache_updated_idx ON catalog_v2.psa_image_cache (updated_at DESC);

-- Part 4: Simplified batch upsert RPC for cards and variants
CREATE OR REPLACE FUNCTION catalog_v2.batch_upsert_cards_variants(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Upsert cards
  INSERT INTO catalog_v2.cards (
    game, set_id, card_id, name, number, provider_id, 
    rarity, supertype, subtypes, images, data, provider
  )
  SELECT 
    x.game, x.set_id, x.card_id, x.name, x.number, x.provider_id,
    x.rarity, x.supertype, 
    CASE WHEN x.subtypes IS NOT NULL THEN string_to_array(x.subtypes, ',') ELSE NULL END,
    CASE WHEN x.images IS NOT NULL THEN x.images::jsonb ELSE NULL END,
    CASE WHEN x.data IS NOT NULL THEN x.data::jsonb ELSE NULL END,
    COALESCE(x.provider, 'justtcg')
  FROM jsonb_to_recordset(payload->'cards') AS x(
    game text, set_id text, card_id text, name text, number text, 
    provider_id text, rarity text, supertype text, subtypes text,
    images text, data text, provider text
  )
  ON CONFLICT (provider, card_id) 
  DO UPDATE SET
    name = EXCLUDED.name,
    number = EXCLUDED.number,
    rarity = EXCLUDED.rarity,
    supertype = EXCLUDED.supertype,
    subtypes = EXCLUDED.subtypes,
    images = EXCLUDED.images,
    data = EXCLUDED.data,
    last_seen_at = now();

  -- Upsert variants
  INSERT INTO catalog_v2.variants (
    game, card_id, variant_key, printing, condition, 
    language, price, currency, sku
  )
  SELECT 
    x.game, x.card_id, x.variant_key, x.printing, x.condition,
    x.language, x.price_cents::numeric / 100, COALESCE(x.currency, 'USD'), x.sku
  FROM jsonb_to_recordset(payload->'variants') AS x(
    game text, card_id text, variant_key text, printing text, 
    condition text, language text, price_cents int, sku text, currency text
  )
  ON CONFLICT (game, variant_key) 
  DO UPDATE SET
    printing = EXCLUDED.printing,
    condition = EXCLUDED.condition,
    language = EXCLUDED.language,
    price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    sku = EXCLUDED.sku,
    last_seen_at = now();

  RETURN jsonb_build_object(
    'success', true,
    'cards_processed', (SELECT count(*) FROM jsonb_array_elements(payload->'cards')),
    'variants_processed', (SELECT count(*) FROM jsonb_array_elements(payload->'variants'))
  );
END;
$$;

COMMENT ON FUNCTION catalog_v2.batch_upsert_cards_variants IS 
'Batch upsert cards and variants from JustTCG sync - returns processing counts';