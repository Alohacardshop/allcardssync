-- Create RPC function to get recent sync errors from catalog_v2 schema
CREATE OR REPLACE FUNCTION public.catalog_v2_get_recent_sync_errors(game_in text DEFAULT 'pokemon', limit_in integer DEFAULT 20)
RETURNS TABLE(set_id text, step text, message text, created_at timestamp with time zone)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT se.set_id, se.step, se.message, se.created_at
  FROM catalog_v2.sync_errors se
  WHERE se.game = game_in
  ORDER BY se.created_at DESC
  LIMIT limit_in;
$function$;