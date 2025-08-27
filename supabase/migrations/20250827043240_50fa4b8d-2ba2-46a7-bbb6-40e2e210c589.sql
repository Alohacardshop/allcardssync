-- Fix catalog_v2_upsert_cards to properly handle both unique constraints
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- First, deduplicate within the input data to prevent conflicts
  WITH parsed_data AS (
    SELECT
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
      now() as updated_from_source_at,
      ROW_NUMBER() OVER (PARTITION BY COALESCE(r->>'provider', 'justtcg'), r->>'card_id' ORDER BY r->>'card_id') as rn_card_id,
      ROW_NUMBER() OVER (PARTITION BY r->>'game', r->>'set_id', nullif(r->>'number','') ORDER BY r->>'card_id') as rn_game_set_number
    FROM jsonb_array_elements(rows) as r
  ),
  deduplicated AS (
    SELECT
      provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
      tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
    FROM parsed_data
    WHERE rn_card_id = 1  -- Keep first occurrence for each (provider, card_id)
      AND (number IS NULL OR rn_game_set_number = 1)  -- Keep first occurrence for each (game, set_id, number)
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

  -- Handle any remaining conflicts on the second unique constraint
  -- by updating records that might have the same (game, set_id, number)
  WITH potential_conflicts AS (
    SELECT DISTINCT
      d.provider, d.card_id, d.game, d.set_id, d.number, d.name, d.rarity, d.supertype, 
      d.subtypes, d.images, d.tcgplayer_product_id, d.tcgplayer_url, d.data
    FROM (
      SELECT
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
    ) d
    WHERE EXISTS (
      SELECT 1 FROM catalog_v2.cards c 
      WHERE c.game = d.game AND c.set_id = d.set_id AND c.number = d.number
        AND (c.provider != d.provider OR c.card_id != d.card_id)
    )
  )
  UPDATE catalog_v2.cards 
  SET provider = pc.provider,
      card_id = pc.card_id,
      name = pc.name,
      rarity = pc.rarity,
      supertype = pc.supertype,
      subtypes = pc.subtypes,
      images = pc.images,
      tcgplayer_product_id = pc.tcgplayer_product_id,
      tcgplayer_url = pc.tcgplayer_url,
      data = pc.data,
      last_seen_at = now(),
      updated_from_source_at = now()
  FROM potential_conflicts pc
  WHERE catalog_v2.cards.game = pc.game 
    AND catalog_v2.cards.set_id = pc.set_id 
    AND catalog_v2.cards.number = pc.number;
      
END
$function$;