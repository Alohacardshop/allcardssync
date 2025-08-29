-- Create RPC functions for shadow table operations

-- Function to upsert sets to shadow table
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_sets_new(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.sets_new (
    provider, set_id, provider_id, game, name, series, printed_total, total, release_date, images, data, updated_from_source_at
  )
  SELECT
    COALESCE(r->>'provider', 'justtcg')::text,
    (r->>'set_id')::text,
    nullif(r->>'provider_id',''),
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
    CASE 
      WHEN r ? 'images' AND r->'images' IS NOT NULL THEN r->'images'
      ELSE NULL
    END,
    CASE 
      WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data'
      ELSE NULL
    END,
    now()
  FROM jsonb_array_elements(rows) as r
  ON CONFLICT (provider, set_id) DO UPDATE
  SET game = excluded.game,
      provider_id = COALESCE(excluded.provider_id, catalog_v2.sets_new.provider_id),
      name = excluded.name,
      series = excluded.series,
      printed_total = excluded.printed_total,
      total = excluded.total,
      release_date = COALESCE(excluded.release_date, catalog_v2.sets_new.release_date),
      images = excluded.images,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();
END
$function$;

-- Function to upsert cards to shadow table
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards_new(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Build a completely deduplicated working set
  CREATE TEMP TABLE tmp_cards_dedup_new ON COMMIT DROP AS
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
  DELETE FROM catalog_v2.cards_new c
  USING tmp_cards_dedup_new d
  WHERE d.number IS NOT NULL
    AND c.game = d.game AND c.set_id = d.set_id AND c.number = d.number
    AND (c.provider <> d.provider OR c.card_id <> d.card_id);

  -- Upsert by (provider, card_id) with completely deduplicated data
  INSERT INTO catalog_v2.cards_new (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM tmp_cards_dedup_new
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

-- Function to upsert variants to shadow table
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_variants_new(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.variants_new (
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
    CASE 
      WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data'
      ELSE NULL
    END,
    now()
  FROM jsonb_array_elements(rows) as r
  WHERE EXISTS (
    SELECT 1 FROM catalog_v2.cards_new c 
    WHERE c.card_id = (r->>'card_id')::text 
    AND c.provider = COALESCE(r->>'provider', 'justtcg')
  )
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