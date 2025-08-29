-- Create helper RPCs for sequential catalog rebuild (correct schema)

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

-- Get pending sets for a game (sets without cards) - using correct column names
CREATE OR REPLACE FUNCTION public.catalog_v2_get_pending_sets_for_game(game_in text)
RETURNS TABLE(provider_id text, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.provider_id, s.name
  FROM catalog_v2.sets_new s
  LEFT JOIN catalog_v2.cards_new c ON c.set_provider_id = s.provider_id AND c.game = game_in
  WHERE s.game = game_in
  GROUP BY s.provider_id, s.name
  HAVING COUNT(c.card_id) = 0
  ORDER BY s.provider_id;
$function$;