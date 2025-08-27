-- One-time migration: Move existing product data to catalog_v2
-- This will populate catalog_v2 with the 165k+ products you already have

-- First, populate sets from existing products
INSERT INTO catalog_v2.sets (provider, set_id, game, name, series, printed_total, total, release_date, images, data, updated_from_source_at)
SELECT DISTINCT 
  'legacy' as provider,
  COALESCE(
    (tcgplayer_data->>'setCode'),
    (tcgcsv_data->>'Set Code'),
    'unknown-' || md5(name)
  ) as set_id,
  CASE 
    WHEN name ILIKE '%pokemon%' OR name ILIKE '%pok%' THEN 'pokemon'
    WHEN name ILIKE '%magic%' OR name ILIKE '%mtg%' THEN 'mtg'
    ELSE 'pokemon'
  END as game,
  name,
  (tcgplayer_data->>'series')::text as series,
  (tcgplayer_data->>'printedTotal')::int as printed_total,
  (tcgplayer_data->>'total')::int as total,
  CASE 
    WHEN (tcgplayer_data->>'releaseDate') IS NOT NULL 
    THEN (tcgplayer_data->>'releaseDate')::date
    ELSE NULL
  END as release_date,
  tcgplayer_data->'images' as images,
  jsonb_build_object(
    'tcgplayer_data', tcgplayer_data,
    'tcgcsv_data', tcgcsv_data,
    'source', 'legacy_migration'
  ) as data,
  now() as updated_from_source_at
FROM products 
WHERE name IS NOT NULL
ON CONFLICT (provider, set_id) DO UPDATE SET
  name = EXCLUDED.name,
  data = EXCLUDED.data,
  last_seen_at = now();

-- Then, populate cards from existing products  
INSERT INTO catalog_v2.cards (provider, card_id, game, set_id, name, number, rarity, supertype, subtypes, images, tcgplayer_product_id, tcgplayer_url, data, updated_from_source_at)
SELECT 
  'legacy' as provider,
  'legacy-' || id::text as card_id,
  CASE 
    WHEN name ILIKE '%pokemon%' OR name ILIKE '%pok%' THEN 'pokemon'
    WHEN name ILIKE '%magic%' OR name ILIKE '%mtg%' THEN 'mtg'
    ELSE 'pokemon'
  END as game,
  COALESCE(
    (tcgplayer_data->>'setCode'),
    (tcgcsv_data->>'Set Code'),
    'unknown-' || md5(name)
  ) as set_id,
  name,
  (tcgplayer_data->>'number')::text as number,
  (tcgplayer_data->>'rarity')::text as rarity,
  (tcgplayer_data->>'supertype')::text as supertype,
  CASE 
    WHEN tcgplayer_data->'subtypes' IS NOT NULL 
    THEN ARRAY(SELECT jsonb_array_elements_text(tcgplayer_data->'subtypes'))
    ELSE NULL
  END::text[] as subtypes,
  tcgplayer_data->'images' as images,
  (tcgplayer_data->>'productId')::bigint as tcgplayer_product_id,
  tcgplayer_data->>'url' as tcgplayer_url,
  jsonb_build_object(
    'tcgplayer_data', tcgplayer_data,
    'tcgcsv_data', tcgcsv_data,
    'source', 'legacy_migration',
    'original_id', id
  ) as data,
  now() as updated_from_source_at
FROM products 
WHERE name IS NOT NULL
ON CONFLICT (provider, card_id) DO UPDATE SET
  name = EXCLUDED.name,
  data = EXCLUDED.data,
  last_seen_at = now();