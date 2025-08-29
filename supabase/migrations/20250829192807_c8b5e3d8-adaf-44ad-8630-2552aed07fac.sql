-- Security Fix Migration Part 2: Address Remaining Security Issues

-- Fix remaining functions with missing search_path
-- These are likely catalog_v2 functions that need updating

-- Fix normalize_game_slug function
CREATE OR REPLACE FUNCTION public.normalize_game_slug(input_game text)
RETURNS text
LANGUAGE sql
IMMUTABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE 
    WHEN input_game IN ('pokemon_japan', 'pokemon-japan') THEN 'pokemon-japan'
    WHEN input_game IN ('pokemon_tcg', 'pokemon') THEN 'pokemon'
    WHEN input_game IN ('magic', 'mtg') THEN 'mtg'
    ELSE input_game
  END;
$$;

-- Fix catalog_v2_stats function
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
RETURNS TABLE(sets_count bigint, cards_count bigint, pending_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'catalog_v2', 'public'
AS $$
  SELECT * FROM catalog_v2.stats(game_in);
$$;

-- Fix catalog_v2_upsert_sets function
CREATE OR REPLACE FUNCTION public.catalog_v2_upsert_sets(rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'catalog_v2', 'public'
AS $$
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
END;
$$;

-- Fix get_recent_sync_jobs function
CREATE OR REPLACE FUNCTION public.get_recent_sync_jobs(limit_count integer DEFAULT 20)
RETURNS TABLE(id text, job_type text, status text, source text, game text, set_id text, total_items integer, processed_items integer, progress_percentage numeric, items_per_second numeric, estimated_completion_at timestamp with time zone, error_message text, results jsonb, metrics jsonb, created_at timestamp with time zone, started_at timestamp with time zone, completed_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'sync_v3', 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    j.id::TEXT,
    j.job_type::TEXT,
    j.status::TEXT,
    j.source,
    j.game,
    j.set_id,
    j.total_items,
    j.processed_items,
    j.progress_percentage,
    j.items_per_second,
    j.estimated_completion_at,
    j.error_message,
    j.results,
    j.metrics,
    j.created_at,
    j.started_at,
    j.completed_at
  FROM sync_v3.jobs j
  ORDER BY j.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Fix cancel_sync_job function
CREATE OR REPLACE FUNCTION public.cancel_sync_job(job_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'sync_v3', 'public'
AS $$
BEGIN
  UPDATE sync_v3.jobs
  SET 
    status = 'cancelled',
    completed_at = now(),
    updated_at = now(),
    error_message = 'Cancelled by user'
  WHERE id = job_id;
END;
$$;

-- Fix manage_justtcg_cron_jobs function
CREATE OR REPLACE FUNCTION public.manage_justtcg_cron_jobs(action text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  discovery_job_sql text;
BEGIN
  -- Use the new daily-set-discovery function
  discovery_job_sql := 'SELECT net.http_post(url := ''https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/daily-set-discovery'', headers := ''"{"Content-Type":"application/json"}"''::jsonb, body := ''{}'');';

  IF action = 'enable' THEN
    -- Enable daily discovery (2 AM daily UTC)
    PERFORM cron.schedule('justtcg-daily-discovery', '0 2 * * *', discovery_job_sql);
    
    RETURN 'JustTCG daily set discovery enabled at 2 AM UTC';
    
  ELSIF action = 'disable' THEN
    PERFORM cron.unschedule('justtcg-daily-discovery');
    PERFORM cron.unschedule('justtcg-weekly-sync'); -- Remove old weekly sync too
    PERFORM cron.unschedule('justtcg-nightly-discovery'); -- Remove old nightly discovery too
    
    RETURN 'JustTCG cron jobs disabled';
    
  ELSIF action = 'status' THEN
    RETURN (
      SELECT COALESCE('Daily discovery: ' || jobname, 'Daily discovery: not scheduled')
      FROM cron.job 
      WHERE jobname = 'justtcg-daily-discovery' 
      LIMIT 1
    );
    
  ELSE
    RETURN 'Invalid action. Use "enable", "disable", or "status"';
  END IF;
END;
$$;