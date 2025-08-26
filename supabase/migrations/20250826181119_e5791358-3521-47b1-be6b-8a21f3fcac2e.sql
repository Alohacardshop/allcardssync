-- Update the catalog_v2_queue_pending_sets_generic function to properly URL-encode parameter values
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
  encoded_value text;
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
    
    -- URL encode the parameter value
    encoded_value := param_value;
    encoded_value := replace(encoded_value, '%', '%25');
    encoded_value := replace(encoded_value, ' ', '%20');
    encoded_value := replace(encoded_value, '"', '%22');
    encoded_value := replace(encoded_value, '#', '%23');
    encoded_value := replace(encoded_value, '&', '%26');
    encoded_value := replace(encoded_value, '+', '%2B');
    encoded_value := replace(encoded_value, ',', '%2C');
    encoded_value := replace(encoded_value, '/', '%2F');
    encoded_value := replace(encoded_value, ':', '%3A');
    encoded_value := replace(encoded_value, ';', '%3B');
    encoded_value := replace(encoded_value, '=', '%3D');
    encoded_value := replace(encoded_value, '?', '%3F');
    encoded_value := replace(encoded_value, '@', '%40');
    encoded_value := replace(encoded_value, '''', '%27');
    encoded_value := replace(encoded_value, '(', '%28');
    encoded_value := replace(encoded_value, ')', '%29');
    
    -- Determine query separator (? or &) based on existing query string
    IF function_path LIKE '%?%' THEN
      query_separator := '&';
    ELSE
      query_separator := '?';
    END IF;
    
    -- Build full URL with encoded parameter
    full_url := functions_base || function_path || query_separator || param_key || '=' || encoded_value;
    
    PERFORM net.http_post(
      url := full_url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    queued := queued + 1;
  END LOOP;
  RETURN queued;
END$function$;