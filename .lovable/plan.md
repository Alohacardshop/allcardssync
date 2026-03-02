

## Summary

Two issues to address:

1. **Quantity editing already works and syncs to Shopify** — the `InlineQuantityEditor` component already updates the DB and calls `v2-shopify-set-inventory` with delta-based adjustments. However, it's currently **blocked** when `isShopifyTruth` is enabled (read-only mode). We need to allow editing even in Shopify-truth mode since the user wants to adjust quantity from the inventory screen.

2. **Delete does not clean up eBay** — the `deleteMutation` in `useInventoryMutations.ts` removes from Shopify but never ends the eBay listing. If the item has an `ebay_offer_id`, we need to call `queue_ebay_end_listing` to end the eBay listing too.

---

### Changes

**File: `src/features/inventory/pages/InventoryPage.tsx`**
- Remove or change `quantityReadOnly={isShopifyTruth}` so quantity is always editable. The `InlineQuantityEditor` already handles Shopify sync via delta adjustments with optimistic locking, so it's safe to allow edits even in truth mode.

**File: `src/features/inventory/hooks/useInventoryMutations.ts`**
- In the `deleteMutation` (around line 278-325), after successfully removing from Shopify, check if the item has an `ebay_offer_id`. If so, call `supabase.rpc('queue_ebay_end_listing', { p_ebay_offer_id: item.ebay_offer_id, p_sku: item.sku })` to queue ending the eBay listing.
- Also do the same in the `removeMutation` for consistency — if removing from Shopify, also end the eBay listing.

**File: `src/features/inventory/types.ts`**
- Ensure `ebay_offer_id` is available on `InventoryListItem` (check if it's already in the type/query).

### Technical Detail

```typescript
// In deleteMutation, after Shopify removal succeeds:
if (item.ebay_offer_id) {
  await supabase.rpc('queue_ebay_end_listing', {
    p_ebay_offer_id: item.ebay_offer_id,
    p_sku: item.sku || ''
  });
}
```

The retry_jobs system will handle the actual eBay API call with exponential backoff, so this is reliable even if eBay is temporarily unavailable.

