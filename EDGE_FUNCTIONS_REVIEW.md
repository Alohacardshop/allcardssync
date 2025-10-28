# Edge Functions Review & Fixes

## Functions Reviewed
1. **shopify-reconcile-inventory** - Ghost inventory cleanup
2. **shopify-import-inventory** - Import existing Shopify products
3. **shopify-webhook** - Webhook event handler

---

## Fixes Applied

### 1. shopify-import-inventory
**Issues Found:**
- ❌ `location_id` parameter was accepted but not used in query
- ❌ `collection_id` parameter was accepted but not used in query
- ❌ GraphQL query didn't fetch inventory levels by location

**Fixes Applied:**
- ✅ Added collection filtering to GraphQL query: `query: "collection_id:123"`
- ✅ Added inventory levels to GraphQL response with location data
- ✅ Added location filtering logic after fetching variants
- ✅ Skip variants not at specified location if `location_id` provided

**Now Works:**
```typescript
// Import only products from specific location
shopify-import-inventory({
  store_key: 'wardave',
  location_id: 'gid://shopify/Location/123',  // ✅ NOW FILTERS!
  limit: 50
})

// Import only products from specific collection
shopify-import-inventory({
  store_key: 'wardave',
  collection_id: 'gid://shopify/Collection/456',  // ✅ NOW FILTERS!
  limit: 50
})
```

---

### 2. shopify-reconcile-inventory
**Issues Found:**
- ❌ Using wrong table name: `inventory_items` (should be `intake_items`)
- ❌ Clearing Shopify IDs but not updating sync status fields

**Fixes Applied:**
- ✅ Fixed table name from `inventory_items` to `intake_items`
- ✅ Added `shopify_sync_status: 'pending'` when clearing IDs
- ✅ Added `last_shopify_sync_error: 'Product no longer exists in Shopify'` for tracking
- ✅ Proper status tracking for orphaned items

**Improved Behavior:**
- Items with missing Shopify products are properly marked as needing re-sync
- Error messages explain why Shopify IDs were cleared
- Items can be re-synced after cleanup

---

### 3. shopify-webhook
**Status:** ✅ Already correct and comprehensive

**Features Verified:**
- ✅ HMAC verification for security
- ✅ Idempotency checking (prevents duplicate processing)
- ✅ Financial status validation (only processes paid orders)
- ✅ Location-aware inventory updates
- ✅ Handles 9 webhook types:
  - `inventory_levels/update`
  - `inventory_items/update`
  - `orders/create`
  - `orders/updated`
  - `orders/fulfilled`
  - `orders/cancelled`
  - `refunds/create`
  - `products/update`
  - `products/delete`

**Security Features:**
- Webhook signature verification using HMAC-SHA256
- Duplicate webhook detection using `webhook_id`
- Logs security warnings for invalid signatures

**Database Tracking:**
- All webhooks logged to `webhook_events` table
- Includes topic, status, payload, error messages
- Supports cleanup via `cleanup_old_webhook_events()` function

---

## Testing Checklist

Once Supabase deployment recovers:

### shopify-reconcile-inventory
- [ ] Run dry-run mode to find orphaned items
- [ ] Verify it detects items with missing Shopify products
- [ ] Run live mode to clean up ghost inventory
- [ ] Confirm cleaned items have correct sync status

### shopify-import-inventory
- [ ] Test basic import (no filters)
- [ ] Test with `location_id` filter
- [ ] Test with `collection_id` filter
- [ ] Test with both filters combined
- [ ] Verify it links existing items by SKU
- [ ] Check it reports unmatched Shopify items

### shopify-webhook
- [ ] Trigger test inventory update webhook
- [ ] Trigger test order webhook
- [ ] Verify HMAC validation works
- [ ] Check duplicate prevention
- [ ] Monitor `webhook_events` table
- [ ] Test financial status filtering

---

## Usage Examples

### Reconciliation (Clean Ghost Inventory)
```typescript
// Preview what would be cleaned
const { data } = await supabase.functions.invoke('shopify-reconcile-inventory', {
  body: {
    store_key: 'wardave',
    batch_size: 50,
    dry_run: true
  }
});

// Actually clean orphaned items
const { data } = await supabase.functions.invoke('shopify-reconcile-inventory', {
  body: {
    store_key: 'wardave',
    batch_size: 50,
    dry_run: false
  }
});
```

### Import (Pull Shopify Inventory)
```typescript
// Import from specific location
const { data } = await supabase.functions.invoke('shopify-import-inventory', {
  body: {
    store_key: 'justgraded',
    location_id: 'gid://shopify/Location/123',
    limit: 100,
    dry_run: false
  }
});

// Import from specific collection
const { data } = await supabase.functions.invoke('shopify-import-inventory', {
  body: {
    store_key: 'wardave',
    collection_id: 'gid://shopify/Collection/456',
    limit: 50,
    dry_run: true  // Preview first
  }
});
```

---

## Deployment Status

**Current:** ⏳ Waiting for Supabase platform recovery

All 3 functions are code-complete and will auto-deploy once Supabase's edge function deployment API recovers from the current HTTP 500 errors.

**Also pending deployment:**
- `admin-relink-graded-by-cert`
- `shopify-webhook-register`
- `bulk-location-transfer`

These are blocked by the same Supabase platform issue, not code problems.
