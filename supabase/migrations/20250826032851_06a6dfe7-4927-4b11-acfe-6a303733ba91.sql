-- Queue all pending sets for a game via pg_net, calling a specific Edge function path
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_generic(
  game_in text,
  functions_base text,
  function_path text  -- e.g. '/catalog-sync-pokemon', '/catalog-sync-pokemon-jp', '/catalog-sync-mtg'
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rec record; queued int := 0;
BEGIN
  FOR rec IN
    SELECT s.id
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.id AND c.game = game_in
    WHERE s.game = game_in
    GROUP BY s.id
    HAVING count(c.id) = 0
  LOOP
    PERFORM net.http_post(
      url := functions_base || function_path || '?setId=' || rec.id,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  END LOOP;
  RETURN queued;
END$$;

REVOKE ALL ON FUNCTION public.catalog_v2_queue_pending_sets_generic(text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.catalog_v2_queue_pending_sets_generic(text,text,text) TO authenticated;