-- Clean up duplicate intake_items and add unique constraint for Shopify sync
-- Strategy: 
-- 1. Update foreign key references to point to the record we're keeping
-- 2. Delete duplicate records, keeping only the most recent one
-- 3. Add unique constraint

-- Step 1: Update shopify_sync_queue to reference the item we're keeping (most recent)
WITH duplicates AS (
  SELECT 
    id,
    store_key,
    sku,
    shopify_location_gid,
    ROW_NUMBER() OVER (
      PARTITION BY store_key, sku, shopify_location_gid 
      ORDER BY created_at DESC
    ) as rn
  FROM intake_items
  WHERE store_key IS NOT NULL 
    AND sku IS NOT NULL 
    AND shopify_location_gid IS NOT NULL
),
kept_records AS (
  SELECT 
    id as kept_id,
    store_key,
    sku,
    shopify_location_gid
  FROM duplicates
  WHERE rn = 1
),
duplicate_ids AS (
  SELECT 
    d.id as old_id,
    k.kept_id as new_id
  FROM duplicates d
  JOIN kept_records k USING (store_key, sku, shopify_location_gid)
  WHERE d.rn > 1
)
UPDATE shopify_sync_queue
SET inventory_item_id = duplicate_ids.new_id
FROM duplicate_ids
WHERE shopify_sync_queue.inventory_item_id = duplicate_ids.old_id;

-- Step 2: Update any other foreign key references (item_snapshots)
WITH duplicates AS (
  SELECT 
    id,
    store_key,
    sku,
    shopify_location_gid,
    ROW_NUMBER() OVER (
      PARTITION BY store_key, sku, shopify_location_gid 
      ORDER BY created_at DESC
    ) as rn
  FROM intake_items
  WHERE store_key IS NOT NULL 
    AND sku IS NOT NULL 
    AND shopify_location_gid IS NOT NULL
),
kept_records AS (
  SELECT 
    id as kept_id,
    store_key,
    sku,
    shopify_location_gid
  FROM duplicates
  WHERE rn = 1
),
duplicate_ids AS (
  SELECT 
    d.id as old_id,
    k.kept_id as new_id
  FROM duplicates d
  JOIN kept_records k USING (store_key, sku, shopify_location_gid)
  WHERE d.rn > 1
)
UPDATE item_snapshots
SET intake_item_id = duplicate_ids.new_id
FROM duplicate_ids
WHERE item_snapshots.intake_item_id = duplicate_ids.old_id;

-- Step 3: Update location_transfer_items references
WITH duplicates AS (
  SELECT 
    id,
    store_key,
    sku,
    shopify_location_gid,
    ROW_NUMBER() OVER (
      PARTITION BY store_key, sku, shopify_location_gid 
      ORDER BY created_at DESC
    ) as rn
  FROM intake_items
  WHERE store_key IS NOT NULL 
    AND sku IS NOT NULL 
    AND shopify_location_gid IS NOT NULL
),
kept_records AS (
  SELECT 
    id as kept_id,
    store_key,
    sku,
    shopify_location_gid
  FROM duplicates
  WHERE rn = 1
),
duplicate_ids AS (
  SELECT 
    d.id as old_id,
    k.kept_id as new_id
  FROM duplicates d
  JOIN kept_records k USING (store_key, sku, shopify_location_gid)
  WHERE d.rn > 1
)
UPDATE location_transfer_items
SET intake_item_id = duplicate_ids.new_id
FROM duplicate_ids
WHERE location_transfer_items.intake_item_id = duplicate_ids.old_id;

-- Step 4: Now delete duplicate records, keeping only the most recent one
WITH duplicates AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY store_key, sku, shopify_location_gid 
      ORDER BY created_at DESC
    ) as rn
  FROM intake_items
  WHERE store_key IS NOT NULL 
    AND sku IS NOT NULL 
    AND shopify_location_gid IS NOT NULL
)
DELETE FROM intake_items
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Step 5: Create a partial unique index
CREATE UNIQUE INDEX idx_intake_items_shopify_unique
ON intake_items (store_key, sku, shopify_location_gid)
WHERE store_key IS NOT NULL 
  AND sku IS NOT NULL 
  AND shopify_location_gid IS NOT NULL;

-- Step 6: Add comment
COMMENT ON INDEX idx_intake_items_shopify_unique IS 
'Ensures unique combination of store_key, sku, and shopify_location_gid for Shopify sync operations.';

-- Step 7: Log completion
INSERT INTO system_logs (level, message, context, source)
VALUES (
  'info',
  'Cleaned up duplicate intake_items and added Shopify unique constraint',
  jsonb_build_object(
    'index_name', 'idx_intake_items_shopify_unique',
    'columns', ARRAY['store_key', 'sku', 'shopify_location_gid']
  ),
  'database_migration'
);