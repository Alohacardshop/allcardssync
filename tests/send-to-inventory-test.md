# Send to Inventory & Shopify Sync Test Plan

## Test Overview
This test verifies the complete flow from sending items to inventory through to Shopify synchronization.

## Flow Steps

### 1. Send to Inventory (Database)
**RPC Function:** `send_intake_items_to_inventory`
**What it does:**
- Marks items with `removed_from_batch_at = now()`
- Sets `updated_at = now()`
- Sets `updated_by = auth.uid()`
- Returns count of processed/failed items

**Trigger:** `trigger_shopify_queue_sync`
- Automatically fires on UPDATE when `removed_from_batch_at` is set
- Queues item for Shopify sync (creates record in `shopify_sync_queue`)

### 2. Send to Shopify (Edge Functions)
**For Raw Cards:** `v2-shopify-send-raw`
**For Graded Cards:** `v2-shopify-send-graded`

**What they do:**
- Create/update product in Shopify
- Set inventory levels
- Update intake_item with Shopify IDs
- Create shopify_sync_snapshot

## Test SQL Queries

### Check if item is ready for sending
```sql
SELECT 
  id, sku, type, store_key, shopify_location_gid,
  removed_from_batch_at, pushed_at, 
  shopify_product_id, shopify_sync_status
FROM public.intake_items
WHERE deleted_at IS NULL 
  AND removed_from_batch_at IS NULL
  AND lot_id IS NOT NULL
LIMIT 5;
```

### Test sending to inventory
```sql
-- Test with items from above query
SELECT public.send_intake_items_to_inventory(
  ARRAY['item-id-1', 'item-id-2']::uuid[]
);
```

### Verify items were marked as sent to inventory
```sql
SELECT 
  id, sku, 
  removed_from_batch_at, 
  updated_at,
  updated_by
FROM public.intake_items
WHERE id IN ('item-id-1', 'item-id-2');
```

### Check if items were queued for Shopify sync
```sql
SELECT 
  id, inventory_item_id, action, status,
  created_at, error_message
FROM public.shopify_sync_queue
WHERE inventory_item_id IN ('item-id-1', 'item-id-2')
ORDER BY created_at DESC;
```

### Monitor Shopify sync progress
```sql
SELECT 
  ii.id,
  ii.sku,
  ii.shopify_sync_status,
  ii.shopify_product_id,
  ii.last_shopify_synced_at,
  sq.status as queue_status,
  sq.error_message
FROM public.intake_items ii
LEFT JOIN public.shopify_sync_queue sq ON sq.inventory_item_id = ii.id
WHERE ii.id IN ('item-id-1', 'item-id-2');
```

## Expected Results

### After Send to Inventory
- ✅ `removed_from_batch_at` is set to current timestamp
- ✅ `updated_at` is set to current timestamp  
- ✅ `updated_by` contains the user's auth ID
- ✅ Record appears in `shopify_sync_queue` with status 'queued'

### After Shopify Sync
- ✅ `shopify_product_id` is populated
- ✅ `shopify_variant_id` is populated
- ✅ `shopify_inventory_item_id` is populated
- ✅ `shopify_sync_status` = 'synced'
- ✅ `last_shopify_synced_at` is set
- ✅ `shopify_sync_snapshot` contains full sync data
- ✅ Queue status is 'completed'

## Common Issues

### Read-Only Transaction Error
**Fixed:** Function now marked as VOLATILE and sets `updated_by` correctly

### Missing updated_by Field
**Fixed:** Added `updated_by = auth.uid()::text` to UPDATE statement

### Items Not Syncing to Shopify
**Check:**
- Shopify credentials are configured (`SHOPIFY_*_STORE_DOMAIN`, `SHOPIFY_*_ACCESS_TOKEN`)
- Items have required fields: `sku`, `store_key`, `shopify_location_gid`
- Shopify sync queue is being processed (check queue table)

## Manual UI Test

1. Navigate to `/batches` page
2. Find a batch with items
3. Click "Send to Inventory" or "Send All to Inventory"
4. Verify toast notification shows success
5. Check that items disappear from batch
6. Navigate to `/inventory` page
7. Verify items appear in inventory
8. Check item details show Shopify product link
