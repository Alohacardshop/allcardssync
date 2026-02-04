

# Show Preview Items for Shopify Backfill

## Problem

The current Preview Mode only shows statistics (e.g., "Would Import: 150 items") but doesn't show *which* items would be imported. You want to see the actual product names/SKUs before committing to the import.

---

## Solution

Add an "items preview" feature that collects and displays sample items during dry run mode.

---

## Technical Changes

### 1. Edge Function: Return Sample Items in Dry Run

**File**: `supabase/functions/shopify-pull-products-by-tags/index.ts`

Add a `previewItems` array that collects up to 50 sample items during dry run:

```typescript
// Add to statistics tracking (around line 200)
let previewItems: Array<{
  sku: string;
  title: string;
  quantity: number;
  price: number;
  location: string;
}> = [];

// Inside the variant processing loop, when dryRun is true (around line 289)
if (dryRun) {
  // Collect sample items for preview (limit to 50)
  if (previewItems.length < 50) {
    previewItems.push({
      sku: variant.sku,
      title: product.title + (variant.title !== 'Default Title' ? ` - ${variant.title}` : ''),
      quantity: variant.inventory_quantity || 0,
      price: parseFloat(variant.price) || 0,
      location: 'Pending inventory check'
    });
  }
  continue;
}
```

Add `previewItems` to the result object (around line 437):

```typescript
const result = {
  success: true,
  dryRun,
  previewItems: dryRun ? previewItems : undefined,  // Only in dry run
  statistics: { ... }
};
```

**Important**: For dry run, we need to run synchronously (not background) to return the preview items. Wrap the background processing logic:

```typescript
// For dry run, run synchronously to return preview items
if (dryRun) {
  await processBackfill();
  return new Response(JSON.stringify(result), { headers: corsHeaders });
}

// For actual import, run in background
EdgeRuntime.waitUntil(processBackfill());
return new Response(JSON.stringify({ success: true, message: 'Import started in background' }), ...);
```

---

### 2. Frontend: Display Preview Items

**File**: `src/pages/admin/ShopifyBackfill.tsx`

Add `previewItems` to the result interface:

```typescript
interface BackfillResult {
  // ... existing fields
  previewItems?: Array<{
    sku: string;
    title: string;
    quantity: number;
    price: number;
  }>;
}
```

Add a scrollable table to show preview items:

```tsx
{result.dryRun && result.previewItems && result.previewItems.length > 0 && (
  <div className="border-t pt-4">
    <p className="text-sm font-medium mb-2">
      Sample Items ({result.previewItems.length} of {result.statistics?.upsertedRows || 0}):
    </p>
    <div className="max-h-64 overflow-auto border rounded">
      <table className="w-full text-xs">
        <thead className="bg-muted sticky top-0">
          <tr>
            <th className="p-2 text-left">SKU</th>
            <th className="p-2 text-left">Title</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {result.previewItems.map((item, i) => (
            <tr key={i} className="border-t">
              <td className="p-2 font-mono">{item.sku}</td>
              <td className="p-2 truncate max-w-[200px]">{item.title}</td>
              <td className="p-2 text-right">{item.quantity}</td>
              <td className="p-2 text-right">${item.price.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {(result.statistics?.upsertedRows || 0) > 50 && (
      <p className="text-xs text-muted-foreground mt-2">
        Showing first 50 items. {(result.statistics?.upsertedRows || 0) - 50} more items would also be imported.
      </p>
    )}
  </div>
)}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/shopify-pull-products-by-tags/index.ts` | Add previewItems collection, run synchronously for dry run |
| `src/pages/admin/ShopifyBackfill.tsx` | Add preview items table display |

---

## Expected Result

After running **Preview Import**, you'll see:
1. Statistics (Products Scanned, Total Variants, Would Import, Skipped)
2. Skip Breakdown (No SKU, Untracked, Low Qty, High Qty)
3. **NEW: Sample Items Table** showing up to 50 items with SKU, Title, Quantity, and Price
4. Note indicating how many more items would be imported beyond the sample

---

## Safety Notes

- Preview (dry run) runs synchronously so it can return item data
- Actual import still runs in background to avoid timeouts
- Sample limited to 50 items to keep response size reasonable
- No database changes during preview

