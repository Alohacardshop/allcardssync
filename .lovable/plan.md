

## End-to-End Pipeline Audit: Intake → Database → Inventory → Shopify → eBay

I traced the full pipeline and found **3 issues** that need fixing:

---

### Issue 1: Tag backfill never ran — existing items have NULL tags

The `trigger_normalize_tags` trigger only generates `shopify_tags` on **INSERT** when tags are NULL. The migration that was supposed to backfill existing items either failed or was lost. SKU `146094215` has `grading_company=PSA`, `grade=10`, `main_category=comics`, `brand_title=Marvel Comics` — but `shopify_tags`, `normalized_tags` are both NULL.

**Impact**: When `v2-shopify-send-graded` reads `intakeItem.normalized_tags || intakeItem.shopify_tags`, it gets an empty array `[]` — the item syncs to Shopify with no tags, breaking storefront filtering and eBay routing rules.

**Fix**: Run a backfill UPDATE that touches each item missing tags, triggering the normalize trigger. But the trigger only runs on INSERT, so we need to also add UPDATE-path tag generation (when `shopify_tags IS NULL` and metadata exists, generate tags regardless of `TG_OP`).

---

### Issue 2: SKU 146094215 is `deleted_at` set AND `queued` in sync queue

The item currently has `deleted_at = 2026-03-02 04:13:49` but still has a `queued` entry in `shopify_sync_queue`. When the sync processor picks it up, it will fetch the item and try to create a Shopify product for a deleted item. The processor doesn't check `deleted_at`.

**Impact**: Potential ghost products in Shopify, or a cryptic error.

**Fix**: 
1. Add a `deleted_at IS NULL` check in `processQueueItem` before proceeding.
2. Clean up the orphaned queue entry for this item.

---

### Issue 3: Trigger only generates tags on INSERT — UPDATE path ignored

When items are updated (e.g., metadata corrected, re-scanned), the trigger skips tag generation because `TG_OP = 'INSERT'` check fails. This means any item that was created before the trigger update, or any item whose metadata is later enriched, will never get auto-generated tags.

**Fix**: Change the trigger condition from `IF NEW.shopify_tags IS NULL AND TG_OP = 'INSERT'` to `IF NEW.shopify_tags IS NULL` (removing the INSERT-only restriction). This way, any UPDATE that results in NULL tags will also auto-generate them.

---

### What's working correctly

- **`useAddIntakeItem`**: Correctly enforces 1-of-1 for graded, handles duplicates, type-safe result handling.
- **`useSendToInventory`**: Now correctly triggers `shopify-sync` after queuing (the fix from the last message).
- **`useBatchSendToShopify`**: Calls `send_and_queue_inventory` RPC + triggers sync processor — working correctly.
- **`send_and_queue_inventory` RPC**: Correctly queues items and sets `removed_from_batch_at`.
- **`shopify-sync` edge function**: Queue processing logic is sound — auth, rate limiting, retry with dead letter queue all correct.
- **`v2-shopify-send-graded`**: Properly reads tags from `normalized_tags`/`shopify_tags`, handles images, metafields, barcode.
- **eBay sync**: Reads from the same `intake_items` with proper status guards and 1-of-1 clamping.

---

### Implementation Plan

**Step 1: SQL migration** — Update `trigger_normalize_tags` to remove the `TG_OP = 'INSERT'` restriction, then run a backfill UPDATE to populate tags for all items with NULL `shopify_tags` and available metadata.

**Step 2: SQL migration** — Clean up the orphaned sync queue entry for the deleted item.

**Step 3: Edge function update** — Add `deleted_at IS NULL` guard in `shopify-sync/index.ts` `processQueueItem` function (around line 657-665) so deleted items are skipped and their queue entries marked as completed.

