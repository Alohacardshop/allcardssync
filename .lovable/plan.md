

## Problem

Reversing or not reversing the array is unreliable because we don't know if the stored `image_urls` order is correct — the data was stored before the PSA sort fix. Shopify assigns **position 1 = featured image** to the first item in the array.

## Fix

Two changes:

### 1. Send images with explicit `position` in `v2-shopify-send-graded/index.ts` (~line 349-352)

Instead of guessing with `.reverse()`, assign `position: 1` to the front image explicitly. Since `psa-lookup` now sorts front-first, `image_urls[0]` should be front. We'll assign position explicitly:

```typescript
images: (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0)
  ? intakeItem.image_urls.map((url: string, idx: number) => ({
      src: url,
      alt: title,
      position: idx + 1  // position 1 = featured (front image)
    }))
  : imageUrl ? [{ src: imageUrl, alt: title, position: 1 }] : []
```

No reverse. Front is at index 0 → position 1 → featured.

### 2. Fallback: if DB data is still stale (stored before sort fix), re-lookup at sync time

For items already in the DB with wrong order, add a quick check: if the item's `psa_snapshot` has image data with `IsFrontImage` flags, re-sort at sync time before sending. This handles legacy data.

```typescript
// Re-sort image_urls using psa_snapshot if available
let orderedImageUrls = intakeItem.image_urls || [];
if (intakeItem.psa_snapshot?.images && Array.isArray(intakeItem.psa_snapshot.images)) {
  const sorted = intakeItem.psa_snapshot.images
    .sort((a, b) => (b.IsFrontImage ? 1 : 0) - (a.IsFrontImage ? 1 : 0));
  orderedImageUrls = sorted.map(img => img.ImageURL).filter(Boolean);
}
```

### 3. Deploy `v2-shopify-send-graded`

### Technical Notes
- Shopify REST API `position` field: position 1 = main/featured image
- The `psa-lookup` sort fix only applies to newly scanned items; existing DB rows need the re-sort at sync time
- No changes needed to `psa-lookup/helpers.ts` — the sort fix there is already correct for future scans

