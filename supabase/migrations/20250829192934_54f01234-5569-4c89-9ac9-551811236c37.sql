-- Security Fix Migration Part 3: Address Final Security Issues

-- Fix remaining database functions with missing search_path
-- Let's find and fix any remaining functions

-- Check and fix any remaining catalog_v2 functions
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'catalog_v2', 'public'
AS $$
BEGIN
  -- Build a completely deduplicated working set
  CREATE TEMP TABLE tmp_cards_dedup ON COMMIT DROP AS
  WITH parsed_input AS (
    SELECT
      COALESCE(r->>'provider', 'justtcg')::text as provider,
      (r->>'card_id')::text as card_id,
      (r->>'game')::text as game,
      (r->>'set_id')::text as set_id,
      (r->>'name')::text as name,
      nullif(r->>'number','') as number,
      nullif(r->>'rarity','') as rarity,
      nullif(r->>'supertype','') as supertype,
      CASE WHEN (r ? 'subtypes') AND jsonb_typeof(r->'subtypes') = 'array'
           THEN (SELECT coalesce(array_agg(x), '{}') FROM jsonb_array_elements_text(r->'subtypes') AS x)
           ELSE NULL END::text[] as subtypes,
      CASE WHEN r ? 'images' AND r->'images' IS NOT NULL THEN r->'images' ELSE NULL END as images,
      nullif(r->>'tcgplayer_product_id','')::bigint as tcgplayer_product_id,
      r->>'tcgplayer_url' as tcgplayer_url,
      CASE WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data' ELSE NULL END as data,
      now() as updated_from_source_at
    FROM jsonb_array_elements(rows) as r
  ),
  -- First deduplicate by (provider, card_id) - this is our primary key
  dedup_by_primary AS (
    SELECT DISTINCT ON (provider, card_id) *
    FROM parsed_input
    ORDER BY provider, card_id
  ),
  -- Then handle (game, set_id, number) conflicts by prioritizing earlier entries
  dedup_by_number AS (
    SELECT DISTINCT ON (game, set_id, number) *
    FROM dedup_by_primary
    WHERE number IS NOT NULL
    ORDER BY game, set_id, number
  ),
  -- Get cards without numbers
  cards_without_numbers AS (
    SELECT * FROM dedup_by_primary WHERE number IS NULL
  ),
  -- Final deduplication to ensure no (provider, card_id) appears twice
  final_dedup AS (
    SELECT * FROM dedup_by_number
    UNION
    SELECT * FROM cards_without_numbers
    WHERE (provider, card_id) NOT IN (
      SELECT provider, card_id FROM dedup_by_number
    )
  )
  SELECT * FROM final_dedup;

  -- Remove existing rows that would violate (game,set_id,number) when inserting our target rows
  DELETE FROM catalog_v2.cards c
  USING tmp_cards_dedup d
  WHERE d.number IS NOT NULL
    AND c.game = d.game AND c.set_id = d.set_id AND c.number = d.number
    AND (c.provider <> d.provider OR c.card_id <> d.card_id);

  -- Upsert by (provider, card_id) with completely deduplicated data
  INSERT INTO catalog_v2.cards (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM tmp_cards_dedup
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
END;
$$;

-- Check for any views that might be causing the Security Definer View warning
-- Let's list all views to see if any exist with SECURITY DEFINER
DO $$
DECLARE
    view_record RECORD;
BEGIN
    -- Check for any views with SECURITY DEFINER that might need attention
    -- This is just a check - if views exist they would need manual review
    RAISE NOTICE 'Checking for views with SECURITY DEFINER property...';
    
    FOR view_record IN 
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
    LOOP
        RAISE NOTICE 'Found view: %.%', view_record.schemaname, view_record.viewname;
    END LOOP;
END $$;

-- Additional security hardening for remaining functions
-- Fix http_post_async function
CREATE OR REPLACE FUNCTION public.http_post_async(url text, headers jsonb, body jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rid bigint;
BEGIN
  -- In current pg_net, http_post returns the async request_id as bigint
  rid := net.http_post(url := url, headers := headers, body := body);
  RETURN rid;
END;
$$;