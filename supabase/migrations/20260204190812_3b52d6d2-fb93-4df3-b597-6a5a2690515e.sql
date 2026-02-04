-- Phase 2: Tag aggregation function and normalization backfill

-- 1. Create get_tag_counts function for efficient tag aggregation
CREATE OR REPLACE FUNCTION public.get_tag_counts(p_store_key TEXT)
RETURNS TABLE(tag TEXT, count BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT unnest(i.normalized_tags) as tag, COUNT(*) as count
  FROM intake_items i
  WHERE i.store_key = p_store_key 
    AND i.deleted_at IS NULL
    AND i.normalized_tags IS NOT NULL
    AND array_length(i.normalized_tags, 1) > 0
  GROUP BY 1
  ORDER BY count DESC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_tag_counts(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tag_counts(TEXT) TO anon;

-- 2. Re-run normalization backfill for items with missing primary_category
-- This fixes the 505 items that have tags but null primary_category
UPDATE intake_items
SET 
  normalized_tags = normalize_shopify_tags(shopify_tags),
  primary_category = CASE
    WHEN shopify_tags && ARRAY['pokemon', 'pokémon'] THEN 'pokemon'
    WHEN shopify_tags && ARRAY['sports', 'baseball', 'basketball', 'football', 'hockey', 'soccer'] THEN 'sports'
    WHEN shopify_tags && ARRAY['yugioh', 'yu-gi-oh', 'magic', 'mtg', 'one-piece', 'digimon', 'dragon-ball', 'lorcana', 'flesh-and-blood'] THEN 'tcg'
    WHEN shopify_tags && ARRAY['comics', 'comic', 'manga', 'dc', 'marvel'] THEN 'comics'
    ELSE NULL
  END,
  condition_type = CASE
    WHEN shopify_tags && ARRAY['sealed', 'box', 'booster', 'etb', 'pack'] THEN 'sealed'
    WHEN shopify_tags && ARRAY['psa', 'cgc', 'bgs', 'sgc', 'graded'] THEN 'graded'
    ELSE 'raw'
  END,
  updated_at = NOW()
WHERE 
  shopify_tags IS NOT NULL 
  AND (normalized_tags IS NULL OR primary_category IS NULL OR condition_type IS NULL);

-- 3. Add comment for documentation
COMMENT ON FUNCTION public.get_tag_counts(TEXT) IS 
'Returns aggregated tag counts for a store. Used by inventory tag filter dropdown for efficient counting without fetching all items.';