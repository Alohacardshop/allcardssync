
# Allow Backfill to Import Items Without SKU

## Summary
Remove the SKU skip logic from the Shopify backfill so items without SKUs are imported. This allows staff to assign SKUs in the local database and sync them back to Shopify.

---

## Current Behavior
Items without a SKU are skipped during backfill with the message:
> "Skipping variant {id} from product {title} - no SKU"

## New Behavior
- Items without SKU will be imported
- They'll use the Shopify variant ID as a temporary identifier
- Staff can add SKUs later and sync back to Shopify

---

## Changes

### File: `supabase/functions/shopify-pull-products-by-tags/index.ts`

**Remove lines 291-297** (the SKU skip block):
```typescript
// DELETE THIS BLOCK:
if (!variant.sku || variant.sku.trim() === '') {
  console.log(`Skipping variant ${variant.id} from product "${product.title}" - no SKU`);
  skippedVariants++;
  skippedNoSku++;
  continue;
}
```

**Update the upsert call** to handle missing SKUs by using variant ID as fallback:
```typescript
// Use variant ID as fallback SKU if none exists
const effectiveSku = (variant.sku && variant.sku.trim()) 
  ? variant.sku 
  : `NOSKU-${variant.id}`;
```

**Update preview items logic** (around line 324) to use the same fallback:
```typescript
previewItems.push({
  sku: effectiveSku,
  title: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
  quantity: variantQty,
  price: parseFloat(variant.price) || 0
});
```

---

## Technical Details

| Location | Change |
|----------|--------|
| Lines 291-297 | Remove SKU skip logic |
| Line ~310 | Add `effectiveSku` variable with fallback |
| Line 324 | Use `effectiveSku` in preview items |
| Line 409 | Use `effectiveSku` in upsert RPC call |

The `NOSKU-{variant_id}` format makes it obvious which items need SKUs assigned, and the variant ID ensures uniqueness.

---

## After This Change

- Backfill will import ALL products meeting quantity criteria
- Items without SKU show with `NOSKU-123456` placeholder
- Staff can edit SKU in inventory UI
- Bi-directional sync will push the new SKU back to Shopify

