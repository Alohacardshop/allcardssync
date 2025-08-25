-- Recreate the RPC with safe DATE handling
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
    nullif(r->>'series',''),
    nullif(r->>'printed_total','')::int,
    nullif(r->>'total','')::int,

    -- SAFE DATE PARSE:
    case
      when coalesce(r->>'release_date','') = '' then null
      when (r->>'release_date') ~ '^\d{4}/\d{2}/\d{2}$'
        then to_date(r->>'release_date', 'YYYY/MM/DD')
      when (r->>'release_date') ~ '^\d{4}-\d{2}-\d{2}$'
        then to_date(r->>'release_date', 'YYYY-MM-DD')
      else null
    end as release_date,

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
end$$;

revoke all on function public.catalog_v2_upsert_sets(jsonb) from public;
grant execute on function public.catalog_v2_upsert_sets(jsonb) to authenticated;