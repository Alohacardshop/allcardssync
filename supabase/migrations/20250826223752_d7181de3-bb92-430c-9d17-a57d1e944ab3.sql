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
  SELECT
    (SELECT count(*) FROM catalog_v2.sets s WHERE s.game = normalize_game_slug(game_in) OR s.game = game_in) as sets_count,
    (SELECT count(*) FROM catalog_v2.cards c WHERE c.game = normalize_game_slug(game_in) OR c.game = game_in) as cards_count,
    (SELECT count(*) FROM (
       SELECT s.set_id
       FROM catalog_v2.sets s
       LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND (c.game = normalize_game_slug(game_in) OR c.game = game_in)
       WHERE s.game = normalize_game_slug(game_in) OR s.game = game_in
       GROUP BY s.set_id
       HAVING count(c.id) = 0
    ) x) as pending_sets
$$;