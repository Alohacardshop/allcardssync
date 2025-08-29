-- Create helper RPCs for sequential catalog rebuild (fixed column names)

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
  found boolean;
  rolled_back integer := 0;
  not_found integer := 0;
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

-- Get pending sets for a game (sets without cards) - using correct column names
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