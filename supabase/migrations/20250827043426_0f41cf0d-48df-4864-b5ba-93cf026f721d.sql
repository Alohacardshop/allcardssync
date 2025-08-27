-- Fix catalog_v2_upsert_variants to only process variants for existing cards
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
  WHERE EXISTS (
    SELECT 1 FROM catalog_v2.cards c 
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