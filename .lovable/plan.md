

## Problem

The 3 remaining "unrepaired" items failing with 404 are **not comics** — they're graded Pokemon cards (Lugia V, Mewtwo GX, Rayquaza VMAX). They fail because their Shopify products have been deleted but the database still holds stale `shopify_product_id` references.

**Root causes:**
1. Stale Shopify product links in `intake_items` — products deleted in Shopify but IDs never cleared
2. The comic repair query filter (`catalog_snapshot->>type.eq.graded_comic`) is too broad and catches graded cards, not just graded comics

## Plan

### 1. Handle 404s gracefully in bulk-comic-repair
In `supabase/functions/bulk-comic-repair/index.ts`, when Shopify returns 404:
- Clear `shopify_product_id` and `shopify_variant_id` on the intake item (product no longer exists)
- Mark the item status as needing re-sync if desired
- Log the cleanup and mark as `'cleaned'` instead of `'failed'`

### 2. Tighten the comic filter query
Update the query in `bulk-comic-repair/index.ts` to exclude non-comic graded items. Add a check like `.eq('main_category', 'comics')` or add a secondary filter ensuring `primary_category` or `sub_category` confirms it's actually a comic, not a Pokemon/sports card.

### 3. Redeploy
Deploy the updated `bulk-comic-repair` function.

## Technical detail

The 404 handler addition (~10 lines) goes right after the `productRes.ok` check around line 210. On 404, it will:
```
await supabase.from('intake_items').update({
  shopify_product_id: null,
  shopify_variant_id: null,
  updated_by: 'comic_bulk_repair_cleanup'
}).eq('id', intakeItem.id)
```
Then `continue` to the next item with status `'cleaned'`.

