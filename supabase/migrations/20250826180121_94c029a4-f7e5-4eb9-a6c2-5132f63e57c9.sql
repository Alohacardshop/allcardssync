-- Update catalog_v2_queue_pending_sets_generic to handle different parameter types based on function path
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_generic(game_in text, functions_base text, function_path text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
  rec record; 
  queued int := 0;
  param_key text;
  param_value text;
  query_separator text;
  full_url text;
BEGIN
  FOR rec IN
    SELECT s.id, s.name
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.id AND c.game = game_in
    WHERE s.game = game_in
    GROUP BY s.id, s.name
    HAVING count(c.id) = 0
  LOOP
    -- Determine parameter key and value based on function path
    IF function_path LIKE '%catalog-sync-justtcg%' THEN
      param_key := 'set';
      param_value := rec.name;
    ELSE
      param_key := 'setId';
      param_value := rec.id;
    END IF;
    
    -- Determine query separator (? or &) based on existing query string
    IF function_path LIKE '%?%' THEN
      query_separator := '&';
    ELSE
      query_separator := '?';
    END IF;
    
    -- Build full URL
    full_url := functions_base || function_path || query_separator || param_key || '=' || param_value;
    
    PERFORM net.http_post(
      url := full_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  END LOOP;
  RETURN queued;
END$function$;

-- Add helper function to find set name by ID
CREATE OR REPLACE FUNCTION public.catalog_v2_find_set_name_by_id(game_in text, id_in text)
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT name FROM catalog_v2.sets 
  WHERE game = game_in AND id = id_in
  LIMIT 1;
$function$;