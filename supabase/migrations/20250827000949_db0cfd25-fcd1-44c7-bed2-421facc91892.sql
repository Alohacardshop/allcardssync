-- Create the catalog_v2.stats RPC function
BEGIN;

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
  WITH s AS (
    SELECT set_id, game FROM catalog_v2.sets WHERE game = game_in
  ),
  c AS (
    SELECT id, set_id, game FROM catalog_v2.cards WHERE game = game_in
  ),
  pend AS (
    SELECT s.set_id
    FROM s
    LEFT JOIN c ON c.set_id = s.set_id
    GROUP BY s.set_id
    HAVING COUNT(c.id) = 0
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM s) AS sets_count,
    (SELECT COUNT(*)::bigint FROM c) AS cards_count,
    (SELECT COUNT(*)::bigint FROM pend) AS pending_count;
$$;

GRANT EXECUTE ON FUNCTION catalog_v2.stats(text) TO authenticated;

COMMIT;