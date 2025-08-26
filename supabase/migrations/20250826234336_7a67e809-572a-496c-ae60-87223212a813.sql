-- Fix catalog_v2 stats function and add proper permissions
-- Also add backfill from public.products if catalog_v2.cards is empty

-- First, create the stats function with proper permissions
CREATE OR REPLACE FUNCTION catalog_v2.stats(game_in text)
RETURNS TABLE (
  sets_count bigint,
  cards_count bigint,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
  WITH game_sets AS (
    SELECT set_id, name FROM catalog_v2.sets WHERE game = game_in
  ),
  game_cards AS (
    SELECT id, set_id FROM catalog_v2.cards WHERE game = game_in
  ),
  pending_sets AS (
    SELECT gs.set_id
    FROM game_sets gs
    LEFT JOIN game_cards gc ON gc.set_id = gs.set_id
    WHERE gc.id IS NULL
  )
  SELECT
    (SELECT COUNT(*)::bigint FROM game_sets) AS sets_count,
    (SELECT COUNT(*)::bigint FROM game_cards) AS cards_count,
    (SELECT COUNT(*)::bigint FROM pending_sets) AS pending_count;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION catalog_v2.stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION catalog_v2.stats(text) TO anon;

-- Create or replace the public schema function that calls the catalog_v2 one
CREATE OR REPLACE FUNCTION public.catalog_v2_stats(game_in text)
RETURNS TABLE (
  sets_count bigint,
  cards_count bigint,
  pending_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
  SELECT * FROM catalog_v2.stats(game_in);
$$;

-- Ensure the public function has the right permissions
GRANT EXECUTE ON FUNCTION public.catalog_v2_stats(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.catalog_v2_stats(text) TO anon;

-- Conditional backfill from public.products to catalog_v2.cards if needed
DO $$
DECLARE
  card_count int;
BEGIN
  -- Check if catalog_v2.cards is empty
  SELECT COUNT(*) INTO card_count FROM catalog_v2.cards;
  
  IF card_count = 0 THEN
    RAISE NOTICE 'catalog_v2.cards is empty, performing backfill from public.products...';
    
    -- Insert cards from products table with basic mapping
    -- Note: This is a simple mapping - adjust field mapping based on actual data structure
    INSERT INTO catalog_v2.cards (
      provider,
      card_id, 
      game,
      set_id,
      name,
      number,
      rarity,
      supertype,
      images,
      tcgplayer_product_id,
      tcgplayer_url,
      data,
      last_seen_at,
      updated_from_source_at,
      created_at
    )
    SELECT 
      'legacy'::text as provider,
      p.id::text as card_id,
      -- Map to canonical game slugs
      CASE 
        WHEN g.name ILIKE '%pokemon%japan%' OR g.name ILIKE '%japanese%' THEN 'pokemon-japan'
        WHEN g.name ILIKE '%pokemon%' THEN 'pokemon' 
        WHEN g.name ILIKE '%magic%' OR g.name ILIKE '%mtg%' THEN 'mtg'
        ELSE 'unknown'
      END as game,
      NULL::text as set_id, -- Will need to be mapped later through sync process
      p.name,
      NULL::text as number, -- Extract from name if needed
      NULL::text as rarity,
      NULL::text as supertype,
      NULL::jsonb as images,
      CASE 
        WHEN p.tcgplayer_data IS NOT NULL AND p.tcgplayer_data ? 'productId' 
        THEN (p.tcgplayer_data->>'productId')::bigint
        ELSE NULL
      END as tcgplayer_product_id,
      CASE 
        WHEN p.tcgplayer_data IS NOT NULL AND p.tcgplayer_data ? 'url'
        THEN p.tcgplayer_data->>'url'
        ELSE NULL
      END as tcgplayer_url,
      p.tcgplayer_data as data,
      NOW() as last_seen_at,
      NOW() as updated_from_source_at,
      COALESCE(p.created_at, NOW()) as created_at
    FROM public.products p
    LEFT JOIN public.groups g ON g.id = p.group_id
    WHERE p.name IS NOT NULL 
      AND LENGTH(TRIM(p.name)) > 0
      AND g.name IS NOT NULL; -- Only products with valid group names
      
    GET DIAGNOSTICS card_count = ROW_COUNT;
    RAISE NOTICE 'Backfilled % cards from public.products to catalog_v2.cards', card_count;
  ELSE
    RAISE NOTICE 'catalog_v2.cards already has % records, skipping backfill', card_count;
  END IF;
END $$;