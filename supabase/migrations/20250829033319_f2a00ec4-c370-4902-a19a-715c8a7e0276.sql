-- Create atomic catalog swap function for transaction safety
CREATE OR REPLACE FUNCTION public.atomic_catalog_swap(game_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Atomic swap in a single transaction
  DELETE FROM catalog_v2.variants WHERE game = game_name;
  DELETE FROM catalog_v2.cards WHERE game = game_name;
  DELETE FROM catalog_v2.sets WHERE game = game_name;

  INSERT INTO catalog_v2.sets SELECT * FROM catalog_v2.sets_new WHERE game = game_name;
  INSERT INTO catalog_v2.cards SELECT * FROM catalog_v2.cards_new WHERE game = game_name;
  INSERT INTO catalog_v2.variants SELECT * FROM catalog_v2.variants_new WHERE game = game_name;
END
$function$;