-- Drop existing functions and recreate with proper permissions and backfill
-- Fix catalog_v2 stats function and add proper permissions

-- Drop existing functions first
DROP FUNCTION IF EXISTS public.catalog_v2_stats(text);
DROP FUNCTION IF EXISTS catalog_v2.stats(text);

-- Create the stats function with proper permissions in catalog_v2 schema
CREATE OR REPLACE FUNCTION catalog_v2.stats(game_in text)
RETURNS TABLE (
  sets_count bigint,
  cards_count bigint,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
  WITH game_sets AS (
    SELECT set_id, name FROM catalog_v2.sets WHERE game = game_in
  ),
  game_cards AS (
    SELECT id, set_id FROM catalog_v2.cards WHERE game = game_in
  ),
  pending_sets AS (
    SELECT gs.set_id
    FROM game_sets gs
    LEFT JOIN game_cards gc ON gc.set_id = gs.set_id
    WHERE gc.id IS NULL
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM game_sets) AS sets_count,
    (SELECT COUNT(*)::bigint FROM game_cards) AS cards_count,
    (SELECT COUNT(*)::bigint FROM pending_sets) AS pending_count;
$$;

-- Create the public schema function that calls the catalog_v2 one
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
RETURNS TABLE (
  sets_count bigint,
  cards_count bigint,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
  SELECT * FROM catalog_v2.stats(game_in);
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION catalog_v2.stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION catalog_v2.stats(text) TO anon;
GRANT EXECUTE ON FUNCTION public.catalog_v2_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_v2_stats(text) TO anon;