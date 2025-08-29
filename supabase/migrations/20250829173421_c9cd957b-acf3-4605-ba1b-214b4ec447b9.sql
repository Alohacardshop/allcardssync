
-- 1) Schema compatibility: ensure cards.set_id exists and is populated, then index it
ALTER TABLE catalog_v2.cards
  ADD COLUMN IF NOT EXISTS set_id text;

UPDATE catalog_v2.cards
SET set_id = set_provider_id
WHERE (set_id IS NULL OR set_id = '')
  AND set_provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS cards_set_id_idx ON catalog_v2.cards (set_id);

-- 2) Fix functions referencing wrong columns

-- 2a) Browse sets: count cards via card_id (not id)
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_sets(
  game_in text,
  filter_japanese boolean DEFAULT false,
  search_in text DEFAULT NULL::text,
  sort_by text DEFAULT 'set_id'::text,
  sort_order text DEFAULT 'asc'::text,
  page_in integer DEFAULT 1,
  limit_in integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  offset_val integer;
  total_count integer;
  sets_data jsonb;
  normalized_game text;
  sort_clause text;
  search_clause text;
  count_query text;
  data_query text;
BEGIN
  normalized_game := normalize_game_slug(game_in);
  offset_val := (page_in - 1) * limit_in;

  IF search_in IS NOT NULL AND length(trim(search_in)) > 0 THEN
    search_clause := format('AND (s.name ILIKE %L OR s.set_id ILIKE %L)', '%' || search_in || '%', '%' || search_in || '%');
  ELSE
    search_clause := '';
  END IF;

  CASE sort_by
    WHEN 'set_id' THEN sort_clause := 'set_id ' || sort_order;
    WHEN 'name' THEN sort_clause := 'name ' || sort_order;
    WHEN 'release_date' THEN sort_clause := 'release_date ' || sort_order || ' NULLS LAST';
    WHEN 'last_seen_at' THEN sort_clause := 'last_seen_at ' || sort_order || ' NULLS LAST';
    ELSE sort_clause := 'set_id ' || sort_order;
  END CASE;

  count_query := format('
    SELECT COUNT(*)
    FROM catalog_v2.sets s
    WHERE (s.game = %L OR s.game = %L) %s',
    normalized_game, game_in, search_clause
  );
  EXECUTE count_query INTO total_count;

  data_query := format('
    WITH sets_with_cards AS (
      SELECT 
        s.set_id,
        s.name,
        s.release_date,
        s.total,
        s.last_seen_at,
        COUNT(c.card_id) as cards_count
      FROM catalog_v2.sets s
      LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = %L OR c.game = %L)
      WHERE (s.game = %L OR s.game = %L) %s
      GROUP BY s.set_id, s.name, s.release_date, s.total, s.last_seen_at
      ORDER BY %s
      LIMIT %s OFFSET %s
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        ''set_id'', set_id,
        ''name'', name,
        ''release_date'', release_date,
        ''total'', total,
        ''cards_count'', cards_count,
        ''last_seen_at'', last_seen_at
      )
    )
    FROM sets_with_cards',
    normalized_game, game_in, normalized_game, game_in, search_clause, sort_clause, limit_in, offset_val
  );
  EXECUTE data_query INTO sets_data;

  RETURN jsonb_build_object(
    'sets', COALESCE(sets_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- 2b) Pending sets: use set_id and card_id
CREATE OR REPLACE FUNCTION public.catalog_v2_pending_sets(
  game_in text,
  limit_in integer DEFAULT 200
)
RETURNS TABLE(set_id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.set_id, s.name
  FROM catalog_v2.sets s
  LEFT JOIN catalog_v2.cards c 
    ON c.set_id = s.set_id 
   AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
  WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
  GROUP BY s.set_id, s.name
  HAVING COUNT(c.card_id) = 0
  ORDER BY s.set_id
  LIMIT limit_in
$function$;

-- 2c) Queue pending sets (legacy) - fix ids
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets(
  game_in text,
  functions_base text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE rec record; queued int := 0;
BEGIN
  FOR rec IN
    SELECT s.set_id
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
    WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
    GROUP BY s.set_id
    HAVING COUNT(c.card_id) = 0
  LOOP
    PERFORM net.http_post(
      url := functions_base || '/catalog-sync-pokemon?setId=' || rec.set_id,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  END LOOP;
  RETURN queued;
END
$function$;

-- 2d) Generic queue (legacy) - fix ids
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_generic(
  game_in text,
  functions_base text,
  function_path text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE 
  rec record; 
  queued int := 0;
  param_key text;
  param_value text;
  encoded_value text;
  query_separator text;
  full_url text;
BEGIN
  FOR rec IN
    SELECT s.set_id, s.name
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
    WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
    GROUP BY s.set_id, s.name
    HAVING count(c.card_id) = 0
  LOOP
    IF function_path LIKE '%catalog-sync-justtcg%' THEN
      param_key := 'set';
      param_value := rec.name;
    ELSE
      param_key := 'setId';
      param_value := rec.set_id;
    END IF;

    encoded_value := param_value;
    encoded_value := replace(encoded_value, '%', '%25');
    encoded_value := replace(encoded_value, ' ', '%20');
    encoded_value := replace(encoded_value, '"', '%22');
    encoded_value := replace(encoded_value, '#', '%23');
    encoded_value := replace(encoded_value, '&', '%26');
    encoded_value := replace(encoded_value, '+', '%2B');
    encoded_value := replace(encoded_value, ',', '%2C');
    encoded_value := replace(encoded_value, '/', '%2F');
    encoded_value := replace(encoded_value, ':', '%3A');
    encoded_value := replace(encoded_value, ';', '%3B');
    encoded_value := replace(encoded_value, '=', '%3D');
    encoded_value := replace(encoded_value, '?', '%3F');
    encoded_value := replace(encoded_value, '@', '%40');
    encoded_value := replace(encoded_value, '''', '%27');
    encoded_value := replace(encoded_value, '(', '%28');
    encoded_value := replace(encoded_value, ')', '%29');

    IF function_path LIKE '%?%' THEN
      query_separator := '&';
    ELSE
      query_separator := '?';
    END IF;

    full_url := functions_base || function_path || query_separator || param_key || '=' || encoded_value;

    PERFORM net.http_post(
      url := full_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  END LOOP;
  RETURN queued;
END
$function$;

-- 2e) Queue into sync_queue (modern) - fix ids
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_to_queue(
  game_in text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE 
  rec record; 
  queued int := 0;
BEGIN
  FOR rec IN
    SELECT s.set_id
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
    WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
    GROUP BY s.set_id
    HAVING count(c.card_id) = 0
  LOOP
    INSERT INTO public.sync_queue (game, set_id)
    VALUES (game_in, rec.set_id)
    ON CONFLICT (game, set_id) DO NOTHING;

    IF FOUND THEN
      queued := queued + 1;
    END IF;
  END LOOP;

  RETURN queued;
END
$function$;

-- 2f) Mode-based queue - fix ids
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_by_mode(
  mode_in text,
  game_in text,
  filter_japanese boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE 
  rec record; 
  queued int := 0;
BEGIN
  FOR rec IN
    SELECT s.set_id
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
    WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
    GROUP BY s.set_id
    HAVING count(c.card_id) = 0
  LOOP
    INSERT INTO public.sync_queue (mode, game, set_id)
    VALUES (mode_in, game_in, rec.set_id)
    ON CONFLICT (mode, set_id) 
    WHERE status IN ('queued', 'processing') 
    DO NOTHING;

    IF FOUND THEN
      queued := queued + 1;
    END IF;
  END LOOP;

  RETURN queued;
END
$function$;

-- 3) Implement catalog_v2.stats to avoid "id" errors from underlying stats call
CREATE OR REPLACE FUNCTION catalog_v2.stats(game_in text)
RETURNS TABLE(sets_count bigint, cards_count bigint, pending_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public','catalog_v2'
AS $function$
  WITH g AS (
    SELECT normalize_game_slug(game_in) AS norm, game_in AS raw
  ),
  sets_filtered AS (
    SELECT s.set_id, s.game
    FROM catalog_v2.sets s, g
    WHERE (s.game = g.norm OR s.game = g.raw)
  ),
  cards_filtered AS (
    SELECT c.card_id, c.set_id, c.game
    FROM catalog_v2.cards c, g
    WHERE (c.game = g.norm OR c.game = g.raw)
  ),
  pending AS (
    SELECT s.set_id
    FROM sets_filtered s
    LEFT JOIN cards_filtered c ON c.set_id = s.set_id
    GROUP BY s.set_id
    HAVING COUNT(c.card_id) = 0
  )
  SELECT
    (SELECT COUNT(*) FROM sets_filtered) AS sets_count,
    (SELECT COUNT(*) FROM cards_filtered) AS cards_count,
    (SELECT COUNT(*) FROM pending) AS pending_count;
$function$;
