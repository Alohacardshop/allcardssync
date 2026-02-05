 # Inventory Truth Contract
 
 **Version:** 1.0  
 **Last Updated:** 2026-02-05
 
 This contract defines the authoritative rules for inventory data flow in the Alohacardshop/allcardssync system. **All code must comply with these principles.**
 
 ---
 
 ## Core Principles
 
 ### 1. Shopify POS + Online is the Source of Truth
 Shopify's inventory levels (per location) are the **definitive source** for available stock. Our local database mirrors Shopify, not the reverse.
 
 ### 2. Supabase Mirrors Shopify Inventory
 The `shopify_inventory_levels` table mirrors Shopify, keyed by:
 - `store_key`
 - `inventory_item_id`  
 - `location_gid`
 
 This table is updated **only** via:
 - `inventory_levels/update` webhooks from Shopify
 - Scheduled reconciliation jobs (read-only from Shopify)
 
 ### 3. App Writes to Shopify: Non-Sale Operations Only
 Our app may write to Shopify inventory **only** for:
 - ✅ **Receiving** (new stock arrival)
 - ✅ **Transfers** (moving stock between locations)
 - ✅ **Recounts/Corrections** (manual adjustments)
 - ✅ **Initial product creation** (sending items to Shopify)
 
 ### 4. Sales Never Trigger Inventory Writes
 When an item sells (Shopify, eBay, or manual):
 - ❌ **DO NOT** call `inventory_levels/set` to Shopify
 - ✅ **DO** update local database to mirror the sale
 - ✅ **DO** rely on Shopify webhooks for inventory sync
 
 **Exception for cross-channel sales (eBay → Shopify):**
 When an eBay sale occurs, we zero Shopify inventory because eBay sales bypass Shopify's awareness. This is the **only** sale-triggered write.
 
 ### 5. Graded Cards: 1-of-1 Location Ownership
 - Graded cards have exactly **1 unit** at exactly **1 location**
 - Use `cards.current_shopify_location_id` as truth
 - Use `enforce_graded` operation for exact 0/1 enforcement
 
 ### 6. Raw Cards: Quantity-Based
 - Raw cards can have quantity > 1
 - Use `manual_adjust` operation (delta-based) for changes
 - Never use `set` API except for initial sync
 
 ---
 
 ## Allowed Write Operations by Trigger
 
 | Trigger | Write to Shopify? | Notes |
 |---------|-------------------|-------|
 | Receiving new stock | ✅ Yes | Set initial quantity |
 | Location transfer | ✅ Yes | Move between locations |
 | Manual recount | ✅ Yes | Correct discrepancies |
 | Shopify sale | ❌ No | Mirror via webhook |
 | Shopify refund | ❌ No | Mirror via webhook (graded: queue restore) |
 | eBay sale | ✅ Yes* | Zero Shopify (cross-channel sync) |
 | Manual "Mark as Sold" | ❌ No | Only update local DB |
 
 ---
 
 ## Code Compliance Checklist
 
 Before merging any inventory code, verify:
 
 - [ ] Does this write to Shopify during a sale event? **If yes, STOP.**
 - [ ] Does this read from `shopify_inventory_levels` for display? **Good.**
 - [ ] Does this use delta adjustments (not absolute sets) for raw cards? **Good.**
  - [ ] Does this respect the `inventory_truth_mode` store setting? **Good.**
  - [ ] Does this handle graded cards as 1-of-1? **Good.**
 
 ---
 
 ## Reconciliation Modes
 
 The `shopify-reconcile-inventory` function supports three modes:
 
 | Mode | When to Use | What It Does |
 |------|-------------|--------------|
 | `full` | Daily scheduled job | Bulk Operations export → parse all inventory levels → upsert mirror → sync intake_items |
 | `drift_only` | Hourly scheduled job | Query items with `shopify_drift=true` → targeted GraphQL → fix drift |
 | `missing_only` | On-demand | Query items with `last_shopify_seen_at IS NULL` → targeted GraphQL → initial sync |
 
 **Safety Features:**
 - Always skips items with active `inventory_write_locks`
 - Uses Bulk Operations for full runs (no rate limits)
 - Falls back to paginated GraphQL if bulk fails
 - Respects rate limits with exponential backoff
 - Records run stats in `sync_health_runs` for dashboard visibility
 
 **Example Invocation:**
 ```bash
 # Dry run (preview changes without applying)
 curl -X POST /functions/v1/shopify-reconcile-inventory \
   -d '{"mode": "full", "store_key": "hawaii", "dry_run": true}'
 
 # Full reconciliation
 curl -X POST /functions/v1/shopify-reconcile-inventory \
   -d '{"mode": "full"}'
 
 # Drift-only (hourly)
 curl -X POST /functions/v1/shopify-reconcile-inventory \
   -d '{"mode": "drift_only"}'
 ```

---

## Centralized Write Safety

All Shopify inventory writes MUST use the centralized `writeInventory()` helper in `_shared/inventory-write.ts`.

### API Selection (Automatic)

| Action | API | Use Case |
|--------|-----|----------|
| `receiving` | adjust | Adding stock from intake |
| `transfer_out` | adjust | Moving stock from source location |
| `transfer_in` | adjust | Moving stock to destination location |
| `refund` | adjust | Restoring stock after refund/cancellation |
| `manual_adjust` | adjust | User-initiated corrections |
| `initial_set` | set | First-time inventory for new products |
| `enforce_graded` | set | Enforcing 0/1 for graded items |
| `cross_channel_zero` | set | Zeroing after cross-channel sale |

### Safety Features

1. **Optimistic Locking**: Optional `expected_available` parameter rejects stale updates
2. **Pre-validation**: Action-specific constraints checked before API call
3. **Comprehensive Logging**: All writes logged to `inventory_write_log` table
4. **Latency Tracking**: Every operation timed and recorded

### Audit Trail

The `inventory_write_log` table captures:
- Request ID for tracing
- Item/SKU/inventory_item_id identification
- Action type and API used
- Delta or set value
- Previous and new quantities
- Success/failure with error messages
- Latency in milliseconds
- Source function and trigger context

---

## Transfer Operations

Location transfers are first-class operations handled by `bulk-location-transfer` edge function.

### Safety Guarantees

1. **Locking**: Acquires `inventory_write_locks` for all SKUs before processing
2. **Finally Release**: Locks are ALWAYS released in finally block, even on errors
3. **Delta-based**: Uses `transfer_out` (-qty) and `transfer_in` (+qty) with adjust API
4. **Optimistic Locking**: Verifies expected quantity before each adjustment
5. **Atomic Rollback**: If destination fails, source is rolled back
6. **Negative Prevention**: Pre-checks source quantity before transfer

### Idempotency

Transfers are safe to retry:
- Checks `location_transfer_items` for already-processed items
- Skips items with `status = 'success'` in the same transfer_id
- Returns early if all items already processed

### Audit Trail

Each transfer line generates:
- Entry in `location_transfer_items` with status and timestamps
- Entry in `audit_log` with before/after quantities
- Entries in `inventory_write_log` for both source and destination writes

### Usage

```bash
curl -X POST /functions/v1/bulk-location-transfer \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "transfer_id": "uuid",
    "item_ids": ["uuid1", "uuid2"],
    "source_location_gid": "gid://shopify/Location/123",
    "destination_location_gid": "gid://shopify/Location/456",
    "store_key": "hawaii"
  }'
```

---

## Inventory Write Locks

The `inventory_write_locks` table prevents race conditions during bulk operations. All operations that modify inventory MUST respect locks.

### Lock Types

| Type | Description | Typical Duration |
|------|-------------|------------------|
| `bulk_transfer` | Items being transferred between locations | 15 min |
| `recount` | Items being physically recounted | 30 min |
| `reconciliation` | Items being reconciled with Shopify | 10 min |
| `manual_adjustment` | User making manual quantity changes | 5 min |

### Lock Helpers

Available in `_shared/inventory-lock-helpers.ts`:

| Function | Description |
|----------|-------------|
| `acquireInventoryLocks()` | Acquire locks for SKUs atomically (batch) |
| `releaseInventoryLocksByBatch()` | Release all locks by batch ID |
| `releaseInventoryLocksBySkus()` | Release locks for specific SKUs |
| `refreshInventoryLocks()` | Extend lock timeout for ongoing operations |
| `isSkuLocked()` | Quick check if single SKU is locked |
| `filterLockedSkus()` | Get locked vs unlocked SKUs from a list |
| `forceReleaseInventoryLocks()` | Admin: force-clear any locks |
| `getActiveLocks()` | Get detailed info about active locks |
| `cleanupExpiredLocks()` | Remove expired locks (opportunistic) |

### Lock Acquisition Pattern

```typescript
import { acquireInventoryLocks, releaseInventoryLocksByBatch } from '../_shared/inventory-lock-helpers.ts';

let lockBatchId: string | null = null;
try {
  const lockResult = await acquireInventoryLocks(
    supabase, skus, storeKey, 'bulk_transfer', userId, 15, { operation: 'transfer' }
  );
  lockBatchId = lockResult.batchId;
  
  if (lockResult.failedSkus.length > 0) {
    // Handle items we couldn't lock
  }
  
  // ... do work ...
  
} finally {
  // ALWAYS release locks
  if (lockBatchId) {
    await releaseInventoryLocksByBatch(supabase, lockBatchId);
  }
}
```

### Operations That Respect Locks

| Operation | Behavior |
|-----------|----------|
| `shopify-reconcile-inventory` | Skips locked SKUs, counts as `skipped_locked` |
| `bulk-location-transfer` | Acquires locks, releases in finally block |
| `shopify-resync-inventory` | Skips locked SKUs |
| `ebay-sync-processor` | Skips locked SKUs |
| `v2-shopify-set-inventory` | Should acquire lock for single item |

### Auto-Expiration

Locks auto-expire after their timeout. Expired locks are cleaned up:
- Opportunistically during lock acquisition
- By background cleanup job (if configured)
- When calling `cleanupExpiredLocks()`

### Admin Force-Clear

Admins can force-release locks via RPC:
```sql
SELECT force_release_inventory_locks(
  p_store_key := 'hawaii',
  p_lock_type := 'bulk_transfer'
);
```

Or by specific lock IDs/SKUs. See `forceReleaseInventoryLocks()` helper.

### UI Indicators

The `InventoryLockIndicator` component shows a subtle lock badge on locked items in the inventory list with:
- Lock icon with amber styling
- Tooltip showing lock type, who locked it, and expiration
- Pulse animation if expiring soon (< 5 min)