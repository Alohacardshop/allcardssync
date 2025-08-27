-- Fix catalog_v2_upsert_cards to properly handle both unique constraints
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Create a temporary table to hold deduplicated data
  CREATE TEMP TABLE temp_cards AS
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
      now() as updated_from_source_at
    FROM jsonb_array_elements(rows) as r
  ),
  -- Deduplicate by provider + card_id first (primary constraint)
  dedup_by_card_id AS (
    SELECT DISTINCT ON (provider, card_id) *
    FROM parsed_data
    ORDER BY provider, card_id
  ),
  -- Then deduplicate by game + set_id + number (secondary constraint)
  dedup_by_game_set_number AS (
    SELECT DISTINCT ON (game, set_id, number) *
    FROM dedup_by_card_id
    WHERE number IS NOT NULL  -- Only process records with numbers for this constraint
    ORDER BY game, set_id, number, card_id
  ),
  -- Combine records with and without numbers
  final_deduped AS (
    -- Records with numbers (deduplicated by both constraints)
    SELECT * FROM dedup_by_game_set_number
    UNION ALL
    -- Records without numbers (only deduplicated by card_id)
    SELECT * FROM dedup_by_card_id 
    WHERE number IS NULL
  )
  SELECT * FROM final_deduped;

  -- Now insert the deduplicated data with proper conflict resolution
  INSERT INTO catalog_v2.cards (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM temp_cards
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
      updated_from_source_at = now()
  ON CONFLICT (game, set_id, number) DO UPDATE
  SET provider = excluded.provider,
      card_id = excluded.card_id,
      name = excluded.name,
      rarity = excluded.rarity,
      supertype = excluded.supertype,
      subtypes = excluded.subtypes,
      images = excluded.images,
      tcgplayer_product_id = excluded.tcgplayer_product_id,
      tcgplayer_url = excluded.tcgplayer_url,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();

  -- Clean up temp table
  DROP TABLE temp_cards;
      
END
$function$;