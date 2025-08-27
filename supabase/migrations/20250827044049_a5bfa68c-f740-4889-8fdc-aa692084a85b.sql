-- Robustly handle both unique constraints by pre-deleting conflicting (game,set_id,number) rows
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- 1) Build a deduplicated working set once and reuse it
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
  dedup_by_card AS (
    SELECT DISTINCT ON (provider, card_id) *
    FROM parsed_input
    ORDER BY provider, card_id
  ),
  dedup_by_number AS (
    SELECT DISTINCT ON (game, set_id, number) *
    FROM dedup_by_card
    WHERE number IS NOT NULL
    ORDER BY game, set_id, number
  )
  SELECT * FROM dedup_by_number
  UNION ALL
  SELECT * FROM dedup_by_card WHERE number IS NULL;

  -- 2) Remove existing rows that would violate (game,set_id,number) when inserting our target rows
  DELETE FROM catalog_v2.cards c
  USING tmp_cards_dedup d
  WHERE d.number IS NOT NULL
    AND c.game = d.game AND c.set_id = d.set_id AND c.number = d.number
    AND (c.provider <> d.provider OR c.card_id <> d.card_id);

  -- 3) Upsert by (provider, card_id)
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
END
$function$;