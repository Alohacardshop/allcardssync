-- Fix catalog_v2_upsert_cards to produce text[] for subtypes from JSON
create or replace function public.catalog_v2_upsert_cards(rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into catalog_v2.cards (
    id, game, name, number, set_id, rarity, supertype, subtypes, images,
    tcgplayer_product_id, tcgplayer_url, data, updated_at
  )
  select
    (r->>'id')::text,
    (r->>'game')::text,
    (r->>'name')::text,
    nullif(r->>'number',''),
    r->>'set_id',
    nullif(r->>'rarity',''),
    nullif(r->>'supertype',''),
    case
      when (r ? 'subtypes') and jsonb_typeof(r->'subtypes') = 'array' then
        (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(r->'subtypes') as x)
      else null
    end::text[],
    (r->>'images')::jsonb,
    nullif(r->>'tcgplayer_product_id','')::bigint,
    r->>'tcgplayer_url',
    (r->>'data')::jsonb,
    now()
  from jsonb_array_elements(rows) as r
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

revoke all on function public.catalog_v2_upsert_cards(jsonb) from public;
grant execute on function public.catalog_v2_upsert_cards(jsonb) to authenticated;