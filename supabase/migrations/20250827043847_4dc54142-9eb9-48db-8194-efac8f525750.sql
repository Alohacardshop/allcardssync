-- Completely rewrite catalog_v2_upsert_cards with better deduplication logic
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Step 1: Parse and deduplicate input data aggressively
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
  -- Step 2: Deduplicate by (provider, card_id) - keep first
  dedup_by_card AS (
    SELECT DISTINCT ON (provider, card_id) *
    FROM parsed_input
    ORDER BY provider, card_id
  ),
  -- Step 3: For cards with numbers, deduplicate by (game, set_id, number) - keep first
  dedup_by_number AS (
    SELECT DISTINCT ON (game, set_id, number) *
    FROM dedup_by_card
    WHERE number IS NOT NULL
    ORDER BY game, set_id, number
  ),
  -- Step 4: Combine deduplicated cards with numbers and cards without numbers
  final_deduped AS (
    SELECT * FROM dedup_by_number
    UNION ALL
    SELECT * FROM dedup_by_card WHERE number IS NULL
  )
  -- Step 5: Insert with conflict resolution for first constraint only
  INSERT INTO catalog_v2.cards (
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  )
  SELECT
    provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at
  FROM final_deduped
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

  -- Step 6: Handle potential (game, set_id, number) conflicts that might still exist
  -- Delete any existing cards that would conflict with our new data on the second constraint
  DELETE FROM catalog_v2.cards 
  WHERE (game, set_id, number) IN (
    SELECT DISTINCT fd.game, fd.set_id, fd.number
    FROM (
      SELECT
        (r->>'game')::text as game,
        (r->>'set_id')::text as set_id,
        nullif(r->>'number','') as number,
        COALESCE(r->>'provider', 'justtcg')::text as provider,
        (r->>'card_id')::text as card_id
      FROM jsonb_array_elements(rows) as r
      WHERE nullif(r->>'number','') IS NOT NULL
    ) fd
    WHERE fd.number IS NOT NULL
  )
  AND (provider, card_id) NOT IN (
    SELECT DISTINCT COALESCE(r->>'provider', 'justtcg')::text, (r->>'card_id')::text
    FROM jsonb_array_elements(rows) as r
  );
      
END
$function$;