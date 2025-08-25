
-- PUBLIC RPC: upsert sets into catalog_v2.sets from a JSONB array
create or replace function public.catalog_v2_upsert_sets(rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into catalog_v2.sets (
    id, game, name, series, printed_total, total, release_date, images, updated_at
  )
  select
    (r->>'id')::text,
    (r->>'game')::text,
    (r->>'name')::text,
    r->>'series',
    nullif(r->>'printed_total','')::int,
    nullif(r->>'total','')::int,
    r->>'release_date',
    (r->>'images')::jsonb,
    now()
  from jsonb_array_elements(rows) as r
  on conflict (id) do update
  set game = excluded.game,
      name = excluded.name,
      series = excluded.series,
      printed_total = excluded.printed_total,
      total = excluded.total,
      release_date = excluded.release_date,
      images = excluded.images,
      updated_at = now();
end
$$;

revoke all on function public.catalog_v2_upsert_sets(jsonb) from public;
grant execute on function public.catalog_v2_upsert_sets(jsonb) to authenticated;

-- PUBLIC RPC: upsert cards into catalog_v2.cards from a JSONB array
create or replace function public.catalog_v2_upsert_cards(rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
    r->>'rarity',
    r->>'supertype',
    case when r ? 'subtypes' then (r->'subtypes')::jsonb else null end,
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
$$;

revoke all on function public.catalog_v2_upsert_cards(jsonb) from public;
grant execute on function public.catalog_v2_upsert_cards(jsonb) to authenticated;
