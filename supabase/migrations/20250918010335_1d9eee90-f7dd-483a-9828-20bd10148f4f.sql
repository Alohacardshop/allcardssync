-- Fix the missing year for Pokemon GO items (2022 set)
UPDATE intake_items 
SET year = '2022' 
WHERE brand_title = 'POKEMON GO' 
  AND year IS NULL 
  AND subject LIKE '%MEWTWO VSTAR%';

-- Remove duplicate entries with same SKU but keep the most recent active one
WITH ranked_items AS (
  SELECT 
    id, 
    sku,
    shopify_location_gid,
    removed_from_batch_at,
    deleted_at,
    ROW_NUMBER() OVER (
      PARTITION BY sku 
      ORDER BY 
        CASE WHEN removed_from_batch_at IS NOT NULL THEN 1 ELSE 2 END,
        created_at DESC
    ) as rn
  FROM intake_items 
  WHERE sku = '111487331'
    AND deleted_at IS NULL
)
UPDATE intake_items 
SET deleted_at = NOW(), 
    deleted_reason = 'Duplicate SKU cleanup'
WHERE id IN (
  SELECT id FROM ranked_items WHERE rn > 1
);