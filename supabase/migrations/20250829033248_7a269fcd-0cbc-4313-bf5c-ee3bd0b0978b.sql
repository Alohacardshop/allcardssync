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
$function$

-- Fix the security definer view issue by making it a regular view
DROP VIEW IF EXISTS catalog_v2.stats;
CREATE VIEW catalog_v2.stats AS
SELECT 
  s.game,
  count(DISTINCT s.set_id) as sets_count,
  count(DISTINCT c.card_id) as cards_count,
  0 as pending_count
FROM catalog_v2.sets s
LEFT JOIN catalog_v2.cards c ON c.set_provider_id = s.provider_id AND c.game = s.game
GROUP BY s.game;

-- Create stats function that can be called with RLS
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
 RETURNS TABLE(sets_count bigint, cards_count bigint, pending_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    count(DISTINCT s.set_id) as sets_count,
    count(DISTINCT c.card_id) as cards_count,
    0::bigint as pending_count
  FROM catalog_v2.sets s
  LEFT JOIN catalog_v2.cards c ON c.set_provider_id = s.provider_id AND c.game = s.game
  WHERE s.game = game_in;
$function$