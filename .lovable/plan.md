

## Problem

Despite sorting front-first in `psa-lookup`, Shopify still features the back image. Shopify uses the **first image in the array** as the featured image, but it seems the stored `image_urls` order isn't matching what we expect — or Shopify is processing them differently.

## Fix

Reverse the `image_urls` array when building the Shopify product payload so the front image (currently at index 0) gets sent last — which Shopify may treat as the primary/featured image.

### Change in `v2-shopify-send-graded/index.ts` (line 350-351)

```typescript
// Reverse so front image is uploaded last and becomes Shopify's featured image
images: (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0)
  ? [...intakeItem.image_urls].reverse().map((url: string) => ({ src: url, alt: title }))
  : imageUrl ? [{ src: imageUrl, alt: title }] : []
```

### Deploy

Redeploy `v2-shopify-send-graded` edge function.

