

## Problem

The back image shows as the primary/featured image in Shopify for graded cards. The current fix attempt — `.reverse()` on `image_urls` at line 354 of `v2-shopify-send-graded` — is fragile because it assumes PSA always returns images in `[back, front]` order, which isn't guaranteed.

## Root Cause

In `supabase/functions/psa-lookup/helpers.ts`, `extractImageUrls` stores images in whatever order the PSA API returns them (line 66). The `IsFrontImage` flag is only used to pick `primaryImageUrl` but **not** to sort the `image_urls` array. So the stored order is unpredictable.

Then `v2-shopify-send-graded` blindly reverses the array hoping to put front first — but if PSA already returned front first, the reverse puts back first.

## Plan

### 1. Fix image ordering at the source — `psa-lookup/helpers.ts`

Update `extractImageUrls` to sort images so the front image is always first:

```typescript
// Sort: front image first, then others
imageUrls = imagesData
  .sort((a, b) => (b.IsFrontImage === true ? 1 : 0) - (a.IsFrontImage === true ? 1 : 0))
  .map(img => img.ImageURL)
  .filter(url => url);
```

This guarantees `image_urls[0]` is always the front image in the database.

### 2. Remove the `.reverse()` hack in `v2-shopify-send-graded`

Since `image_urls` will now be reliably front-first, remove the reverse logic on line 349-355 and use the array directly for both comics and cards:

```typescript
images: intakeItem.image_urls.map((url) => ({ src: url, alt: title }))
```

### 3. Deploy and re-sync

After deploying both edge functions, re-scan cert `146094215` and sync to Shopify. The front image will be first in the array, and Shopify will use it as the featured image.

