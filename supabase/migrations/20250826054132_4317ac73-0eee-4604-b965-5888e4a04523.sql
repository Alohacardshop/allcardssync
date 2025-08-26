-- Create RPC function to find set ID by name (SECURITY DEFINER to access catalog_v2 schema)
CREATE OR REPLACE FUNCTION public.catalog_v2_find_set_id_by_name(game_in text, name_in text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT id FROM catalog_v2.sets 
  WHERE game = game_in AND name = name_in
  LIMIT 1;
$function$;