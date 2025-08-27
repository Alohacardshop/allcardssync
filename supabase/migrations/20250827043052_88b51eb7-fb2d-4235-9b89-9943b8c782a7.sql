-- Fix catalog_v2_upsert_cards to handle both unique constraints properly
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- First, deduplicate the input data by card_id
  WITH deduplicated_input AS (
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
    FROM jsonb_array_elements(rows) as r
    ORDER BY (r->>'card_id')::text
  )
  -- Insert with conflict resolution for the primary constraint
  INSERT INTO catalog_v2.cards (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM deduplicated_input
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

  -- Now handle any potential conflicts with the second constraint (game, set_id, number)
  -- by updating existing records that might conflict
  UPDATE catalog_v2.cards 
  SET provider = d.provider,
      card_id = d.card_id,
      name = d.name,
      rarity = d.rarity,
      supertype = d.supertype,
      subtypes = d.subtypes,
      images = d.images,
      tcgplayer_product_id = d.tcgplayer_product_id,
      tcgplayer_url = d.tcgplayer_url,
      data = d.data,
      last_seen_at = now(),
      updated_from_source_at = now()
  FROM (
    SELECT DISTINCT ON (game, set_id, number)
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
      END as data
    FROM jsonb_array_elements(rows) as r
    WHERE nullif(r->>'number','') IS NOT NULL
    ORDER BY game, set_id, number, (r->>'card_id')::text DESC
  ) d
  WHERE catalog_v2.cards.game = d.game 
    AND catalog_v2.cards.set_id = d.set_id 
    AND catalog_v2.cards.number = d.number
    AND (catalog_v2.cards.provider != d.provider OR catalog_v2.cards.card_id != d.card_id);
      
END
$function$;