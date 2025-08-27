-- Fix the catalog_v2_upsert_cards function to properly handle ordinality
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
      (r->>'images')::jsonb as images,
      nullif(r->>'tcgplayer_product_id','')::bigint as tcgplayer_product_id,
      r->>'tcgplayer_url' as tcgplayer_url,
      (r->>'data')::jsonb as data,
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

-- Fix the catalog_v2_find_set_id_by_name function to return set_id instead of id
CREATE OR REPLACE FUNCTION public.catalog_v2_find_set_id_by_name(game_in text, name_in text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT set_id FROM catalog_v2.sets 
  WHERE game = game_in AND name = name_in
  LIMIT 1;
$function$;