-- Create helper RPCs for sequential catalog rebuild

-- Clear shadow tables for a specific game
CREATE OR REPLACE FUNCTION public.catalog_v2_clear_shadow_for_game(game_in text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM catalog_v2.variants_new WHERE game = game_in;
  DELETE FROM catalog_v2.cards_new WHERE game = game_in;
  DELETE FROM catalog_v2.sets_new WHERE game = game_in;
END
$function$;

-- Get count of null provider_id in sets_new for validation
CREATE OR REPLACE FUNCTION public.catalog_v2_sets_new_null_provider_count(game_in text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COUNT(*)::integer
  FROM catalog_v2.sets_new
  WHERE game = game_in AND provider_id IS NULL;
$function$;

-- Guardrail function to validate sets_new against API data
CREATE OR REPLACE FUNCTION public.catalog_v2_guardrail_sets_new(game_in text, api_sets jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  api_set jsonb;
  found boolean;
  rolled_back integer := 0;
  not_found integer := 0;
  normalized_api_name text;
  normalized_shadow_name text;
BEGIN
  -- Create a map of normalized API set names
  CREATE TEMP TABLE api_sets_normalized AS
  SELECT 
    (s->>'set_id')::text as set_id,
    (s->>'name')::text as name,
    lower(regexp_replace((s->>'name')::text, '[^a-zA-Z0-9]+', ' ', 'g')) as normalized_name
  FROM jsonb_array_elements(api_sets) as s;
  
  -- Check each set in shadow table
  FOR rec IN
    SELECT set_id, name, provider_id
    FROM catalog_v2.sets_new
    WHERE game = game_in AND provider_id IS NOT NULL
  LOOP
    normalized_shadow_name := lower(regexp_replace(rec.name, '[^a-zA-Z0-9]+', ' ', 'g'));
    
    -- Check if this set exists in API data with matching name
    SELECT EXISTS(
      SELECT 1 FROM api_sets_normalized 
      WHERE set_id = rec.set_id AND normalized_name = normalized_shadow_name
    ) INTO found;
    
    IF NOT found THEN
      -- Set not found or name mismatch - clear provider_id
      UPDATE catalog_v2.sets_new 
      SET provider_id = NULL 
      WHERE set_id = rec.set_id AND game = game_in;
      
      -- Check if it was not found vs name mismatch
      IF EXISTS(SELECT 1 FROM api_sets_normalized WHERE set_id = rec.set_id) THEN
        rolled_back := rolled_back + 1;
      ELSE
        not_found := not_found + 1;
      END IF;
    END IF;
  END LOOP;
  
  DROP TABLE api_sets_normalized;
  
  RETURN jsonb_build_object('rolled_back', rolled_back, 'not_found', not_found);
END
$function$;

-- Get pending sets for a game (sets without cards)
CREATE OR REPLACE FUNCTION public.catalog_v2_get_pending_sets_for_game(game_in text)
RETURNS TABLE(set_id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.set_id, s.name
  FROM catalog_v2.sets_new s
  LEFT JOIN catalog_v2.cards_new c ON c.set_id = s.set_id AND c.game = game_in
  WHERE s.game = game_in
  GROUP BY s.set_id, s.name
  HAVING COUNT(c.card_id) = 0
  ORDER BY s.set_id;
$function$;

-- Fix existing browse functions to use proper column names
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_sets(game_in text, filter_japanese boolean DEFAULT false, search_in text DEFAULT NULL::text, sort_by text DEFAULT 'set_id'::text, sort_order text DEFAULT 'asc'::text, page_in integer DEFAULT 1, limit_in integer DEFAULT 50)
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
  -- Normalize the game slug
  normalized_game := normalize_game_slug(game_in);
  
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Build search clause
  IF search_in IS NOT NULL AND length(trim(search_in)) > 0 THEN
    search_clause := format('AND (s.name ILIKE %L OR s.set_id ILIKE %L)', '%' || search_in || '%', '%' || search_in || '%');
  ELSE
    search_clause := '';
  END IF;
  
  -- Build sort clause with proper column references
  CASE sort_by
    WHEN 'set_id' THEN sort_clause := 'set_id ' || sort_order;
    WHEN 'name' THEN sort_clause := 'name ' || sort_order;
    WHEN 'release_date' THEN sort_clause := 'release_date ' || sort_order || ' NULLS LAST';
    WHEN 'last_seen_at' THEN sort_clause := 'last_seen_at ' || sort_order || ' NULLS LAST';
    ELSE sort_clause := 'set_id ' || sort_order;
  END CASE;
  
  -- Get total count with optimized query
  count_query := format('
    SELECT COUNT(*)
    FROM catalog_v2.sets s
    WHERE (s.game = %L OR s.game = %L) %s',
    normalized_game, game_in, search_clause
  );
  
  EXECUTE count_query INTO total_count;
  
  -- Get sets data with pagination using optimized query
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
  
  -- Return result
  RETURN jsonb_build_object(
    'sets', COALESCE(sets_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$function$;

-- Fix catalog stats function
CREATE OR REPLACE FUNCTION catalog_v2.stats(game_in text)
RETURNS TABLE(sets_count bigint, cards_count bigint, pending_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'catalog_v2', 'public'
AS $function$
  WITH normalized AS (
    SELECT normalize_game_slug(game_in) as game
  ), 
  set_stats AS (
    SELECT COUNT(*) as sets_count
    FROM catalog_v2.sets s, normalized n
    WHERE s.game = n.game OR s.game = game_in
  ),
  card_stats AS (
    SELECT COUNT(*) as cards_count  
    FROM catalog_v2.cards c, normalized n
    WHERE c.game = n.game OR c.game = game_in
  ),
  pending_stats AS (
    SELECT COUNT(DISTINCT s.set_id) as pending_count
    FROM catalog_v2.sets s, normalized n
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = n.game OR c.game = game_in)
    WHERE (s.game = n.game OR s.game = game_in)
    GROUP BY s.set_id
    HAVING COUNT(c.card_id) = 0
  )
  SELECT 
    COALESCE(set_stats.sets_count, 0) as sets_count,
    COALESCE(card_stats.cards_count, 0) as cards_count, 
    COALESCE((SELECT COUNT(*) FROM pending_stats), 0) as pending_count
  FROM set_stats, card_stats;
$function$;