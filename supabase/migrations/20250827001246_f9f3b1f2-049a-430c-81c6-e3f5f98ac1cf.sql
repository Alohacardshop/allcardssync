-- Fixed conditional backfill from public.products to catalog_v2.cards
BEGIN;

DO $$
BEGIN
  -- Only backfill if catalog_v2.cards is completely empty
  IF (SELECT COUNT(*) FROM catalog_v2.cards) = 0 THEN
    
    -- Insert best-effort mapping from products table
    INSERT INTO catalog_v2.cards (
      provider, card_id, game, set_id, name, images, tcgplayer_product_id, 
      created_at, updated_from_source_at, last_seen_at
    )
    SELECT
      'legacy'::text AS provider,
      p.id::text AS card_id,
      CASE
        WHEN p.name ILIKE '%pokemon%' OR p.name ILIKE '%pokémon%' THEN 'pokemon'
        WHEN p.name ILIKE '%japan%' THEN 'pokemon-japan'  
        WHEN p.name ILIKE '%magic%' OR p.name ILIKE '%mtg%' THEN 'mtg'
        ELSE 'mtg'
      END AS game,
      NULL::text AS set_id,  -- No reliable set mapping available
      p.name,
      NULL::jsonb AS images,  -- No image data in products table
      COALESCE(
        (p.tcgplayer_data->>'productId')::bigint,
        (p.tcgplayer_data->>'tcgplayer_product_id')::bigint
      ) AS tcgplayer_product_id,
      COALESCE(p.created_at, NOW()) AS created_at,
      NOW() AS updated_from_source_at,
      NOW() AS last_seen_at
    FROM public.products p
    WHERE p.name IS NOT NULL
      AND p.name != '';
      
    -- Log how many records were backfilled
    RAISE NOTICE 'Backfilled % cards from public.products to catalog_v2.cards', 
      (SELECT COUNT(*) FROM catalog_v2.cards WHERE provider = 'legacy');
      
  ELSE
    RAISE NOTICE 'Skipped backfill - catalog_v2.cards already contains % records', 
      (SELECT COUNT(*) FROM catalog_v2.cards);
  END IF;
END $$;

COMMIT;