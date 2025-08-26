-- Update the catalog_v2_upsert_cards function to deduplicate input rows by ID
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_cards(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Use a CTE to deduplicate by ID, keeping the last occurrence of each ID
  WITH deduplicated AS (
    SELECT DISTINCT ON ((r->>'id')::text)
      (r->>'id')::text as card_id,
      (r->>'game')::text as game,
      (r->>'name')::text as name,
      nullif(r->>'number','') as number,
      r->>'set_id' as set_id,
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
      now() as updated_at
    FROM jsonb_array_elements(rows) as r
    ORDER BY (r->>'id')::text, ordinality DESC  -- Keep last occurrence
  )
  insert into catalog_v2.cards (
    id, game, name, number, set_id, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_at
  )
  select
    card_id, game, name, number, set_id, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_at
  from deduplicated
  on conflict (id) do update
  set game = excluded.game,
      name = excluded.name,
      number = excluded.number,
      set_id = excluded.set_id,
      rarity = excluded.rarity,
      supertype = excluded.supertype,
      subtypes = excluded.subtypes,
      images = excluded.images,
      tcgplayer_product_id = excluded.tcgplayer_product_id,
      tcgplayer_url = excluded.tcgplayer_url,
      data = excluded.data,
      updated_at = now();
end
$function$;