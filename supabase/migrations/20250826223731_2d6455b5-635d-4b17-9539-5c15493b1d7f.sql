-- Step 1: Update database functions to handle game slug synonyms

-- Helper function to normalize game slugs
CREATE OR REPLACE FUNCTION public.normalize_game_slug(input_game text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE 
    WHEN input_game IN ('pokemon_japan', 'pokemon-japan') THEN 'pokemon-japan'
    WHEN input_game IN ('pokemon_tcg', 'pokemon') THEN 'pokemon'
    WHEN input_game IN ('magic', 'mtg') THEN 'mtg'
    ELSE input_game
  END;
$$;

-- Update catalog_v2_stats to use normalized game slugs
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
RETURNS TABLE(sets_count bigint, cards_count bigint, pending_sets bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH normalized_game AS (
    SELECT normalize_game_slug(game_in) as game_slug
  )
  SELECT
    (SELECT count(*) FROM catalog_v2.sets s, normalized_game ng WHERE (s.game = ng.game_slug OR s.game = game_in)) as sets_count,
    (SELECT count(*) FROM catalog_v2.cards c, normalized_game ng WHERE (c.game = ng.game_slug OR c.game = game_in)) as cards_count,
    (SELECT count(*) FROM (
       SELECT s.set_id
       FROM catalog_v2.sets s, normalized_game ng
       LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = ng.game_slug OR c.game = game_in)
       WHERE (s.game = ng.game_slug OR s.game = game_in)
       GROUP BY s.set_id
       HAVING count(c.id) = 0
    ) x) as pending_sets
$$;

-- Update catalog_v2_browse_sets to handle both slug formats
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_sets(game_in text, filter_japanese boolean DEFAULT false, search_in text DEFAULT NULL::text, sort_by text DEFAULT 'set_id'::text, sort_order text DEFAULT 'asc'::text, page_in integer DEFAULT 1, limit_in integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  offset_val integer;
  total_count integer;
  sets_data jsonb;
  normalized_game text;
BEGIN
  -- Normalize the game slug
  normalized_game := normalize_game_slug(game_in);
  
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM catalog_v2.sets s
  WHERE (s.game = normalized_game OR s.game = game_in)
    AND (search_in IS NULL OR s.name ILIKE '%' || search_in || '%' OR s.set_id ILIKE '%' || search_in || '%');
  
  -- Get sets data with pagination
  WITH sets_with_cards AS (
    SELECT 
      s.set_id,
      s.name,
      s.release_date,
      s.total,
      s.last_seen_at,
      COUNT(c.id) as cards_count
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalized_game OR c.game = game_in)
    WHERE (s.game = normalized_game OR s.game = game_in)
      AND (search_in IS NULL OR s.name ILIKE '%' || search_in || '%' OR s.set_id ILIKE '%' || search_in || '%')
    GROUP BY s.set_id, s.name, s.release_date, s.total, s.last_seen_at
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'set_id', set_id,
      'name', name,
      'release_date', release_date,
      'total', total,
      'cards_count', cards_count,
      'last_seen_at', last_seen_at
    )
  ) INTO sets_data
  FROM (
    SELECT *
    FROM sets_with_cards
    ORDER BY 
      CASE WHEN sort_by = 'set_id' AND sort_order = 'asc' THEN set_id END ASC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'desc' THEN set_id END DESC,
      CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN name END ASC,
      CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN name END DESC,
      CASE WHEN sort_by = 'release_date' AND sort_order = 'asc' THEN release_date END ASC,
      CASE WHEN sort_by = 'release_date' AND sort_order = 'desc' THEN release_date END DESC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'asc' THEN last_seen_at END ASC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'desc' THEN last_seen_at END DESC
    LIMIT limit_in OFFSET offset_val
  ) sorted_sets;
  
  -- Return result
  RETURN jsonb_build_object(
    'sets', COALESCE(sets_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$$;

-- Update catalog_v2_browse_cards to handle both slug formats
CREATE OR REPLACE FUNCTION public.catalog_v2_browse_cards(game_in text, filter_japanese boolean DEFAULT false, search_in text DEFAULT NULL::text, set_id_in text DEFAULT NULL::text, rarity_in text DEFAULT NULL::text, sort_by text DEFAULT 'card_id'::text, sort_order text DEFAULT 'asc'::text, page_in integer DEFAULT 1, limit_in integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  offset_val integer;
  total_count integer;
  cards_data jsonb;
  normalized_game text;
BEGIN
  -- Normalize the game slug
  normalized_game := normalize_game_slug(game_in);
  
  -- Calculate offset
  offset_val := (page_in - 1) * limit_in;
  
  -- Get total count
  SELECT COUNT(*) INTO total_count
  FROM catalog_v2.cards c
  WHERE (c.game = normalized_game OR c.game = game_in)
    AND (search_in IS NULL OR c.name ILIKE '%' || search_in || '%' OR c.card_id ILIKE '%' || search_in || '%')
    AND (set_id_in IS NULL OR c.set_id = set_id_in)
    AND (rarity_in IS NULL OR c.rarity = rarity_in);
  
  -- Get cards data with pagination
  SELECT jsonb_agg(
    jsonb_build_object(
      'card_id', card_id,
      'set_id', set_id,
      'name', name,
      'number', number,
      'rarity', rarity,
      'supertype', supertype,
      'last_seen_at', last_seen_at
    )
  ) INTO cards_data
  FROM (
    SELECT *
    FROM catalog_v2.cards c
    WHERE (c.game = normalized_game OR c.game = game_in)
      AND (search_in IS NULL OR c.name ILIKE '%' || search_in || '%' OR c.card_id ILIKE '%' || search_in || '%')
      AND (set_id_in IS NULL OR c.set_id = set_id_in)
      AND (rarity_in IS NULL OR c.rarity = rarity_in)
    ORDER BY 
      CASE WHEN sort_by = 'card_id' AND sort_order = 'asc' THEN card_id END ASC,
      CASE WHEN sort_by = 'card_id' AND sort_order = 'desc' THEN card_id END DESC,
      CASE WHEN sort_by = 'name' AND sort_order = 'asc' THEN name END ASC,
      CASE WHEN sort_by = 'name' AND sort_order = 'desc' THEN name END DESC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'asc' THEN set_id END ASC,
      CASE WHEN sort_by = 'set_id' AND sort_order = 'desc' THEN set_id END DESC,
      CASE WHEN sort_by = 'rarity' AND sort_order = 'asc' THEN rarity END ASC,
      CASE WHEN sort_by = 'rarity' AND sort_order = 'desc' THEN rarity END DESC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'asc' THEN last_seen_at END ASC,
      CASE WHEN sort_by = 'last_seen_at' AND sort_order = 'desc' THEN last_seen_at END DESC
    LIMIT limit_in OFFSET offset_val
  ) sorted_cards;
  
  -- Return result
  RETURN jsonb_build_object(
    'cards', COALESCE(cards_data, '[]'::jsonb),
    'total_count', total_count
  );
END
$$;