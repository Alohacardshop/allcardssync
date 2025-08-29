-- Create helper RPC to fetch sets for backfilling provider_ids without exposing non-public schemas directly
CREATE OR REPLACE FUNCTION public.catalog_v2_get_sets_for_backfill(
  game_in text,
  force_in boolean DEFAULT false
)
RETURNS TABLE(set_id text, name text, provider_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.set_id, s.name, s.provider_id
  FROM catalog_v2.sets s
  WHERE (s.game = normalize_game_slug(game_in) OR s.game = game_in)
    AND (
      force_in
      OR s.provider_id IS NULL
      OR s.provider_id = ''
      OR s.provider_id = s.set_id
    )
  ORDER BY s.set_id;
$function$;