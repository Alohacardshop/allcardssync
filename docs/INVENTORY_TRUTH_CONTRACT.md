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