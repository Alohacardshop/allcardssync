-- Fix catalog_v2_upsert_sets to handle JSON data properly
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

-- Fix catalog_v2_upsert_cards to handle JSON data properly
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Use a CTE to deduplicate by card_id, keeping the last occurrence
  WITH elements_with_ordinality AS (
    SELECT r, row_number() OVER () as ordinality
    FROM jsonb_array_elements(rows) as r
  ),
  deduplicated AS (
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
      CASE 
        WHEN r ? 'images' AND r->'images' IS NOT NULL THEN r->'images'
        ELSE NULL
      END as images,
      nullif(r->>'tcgplayer_product_id','')::bigint as tcgplayer_product_id,
      r->>'tcgplayer_url' as tcgplayer_url,
      CASE 
        WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data'
        ELSE NULL
      END as data,
      now() as updated_from_source_at
    FROM elements_with_ordinality
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

-- Fix catalog_v2_upsert_variants to handle JSON data properly
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
    CASE 
      WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data'
      ELSE NULL
    END,
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