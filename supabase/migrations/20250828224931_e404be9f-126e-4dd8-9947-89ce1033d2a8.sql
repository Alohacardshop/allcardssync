-- Update catalog_v2_upsert_sets function to handle provider_id
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_sets(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO catalog_v2.sets (
    provider, set_id, provider_id, game, name, series, printed_total, total, release_date, images, data, updated_from_source_at
  )
  SELECT
    COALESCE(r->>'provider', 'justtcg')::text,
    (r->>'set_id')::text,
    nullif(r->>'provider_id',''),
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
    CASE 
      WHEN r ? 'images' AND r->'images' IS NOT NULL THEN r->'images'
      ELSE NULL
    END,
    CASE 
      WHEN r ? 'data' AND r->'data' IS NOT NULL THEN r->'data'
      ELSE NULL
    END,
    now()
  FROM jsonb_array_elements(rows) as r
  ON CONFLICT (provider, set_id) DO UPDATE
  SET game = excluded.game,
      provider_id = COALESCE(excluded.provider_id, catalog_v2.sets.provider_id),
      name = excluded.name,
      series = excluded.series,
      printed_total = excluded.printed_total,
      total = excluded.total,
      release_date = COALESCE(excluded.release_date, catalog_v2.sets.release_date),
      images = excluded.images,
      data = excluded.data,
      last_seen_at = now(),
      updated_from_source_at = now();
END
$function$;