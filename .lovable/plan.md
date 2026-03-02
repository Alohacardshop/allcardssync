

## Plan: Send Only the Front Image to Shopify (Skip Back Image)

### Problem
Despite multiple reordering strategies, Shopify continues showing the back image as featured for comics. None of the approaches (GraphQL reorder, two-step upload, variant media fix) have reliably worked.

### Solution
Simplify drastically: only send the front image to Shopify. Customers can look up the cert number to see the back image if needed.

### Changes

**1. `supabase/functions/shopify-sync/index.ts`** — `createShopifyProduct()`
- Remove the two-step upload logic entirely
- Replace image array construction with: send only the front image (from `determineFrontImageUrl()`)
- If no front image identified, fall back to `image_urls[0]` or `image_url`
- Result: product always created with exactly 1 image — the front
- Remove the deferred front image upload block (the `sleep(1500)` + POST section)
- Keep `ensureMediaOrder()` call but it will be a no-op with single images

**2. `supabase/functions/v2-shopify-send-graded/index.ts`**
- Same change: in the `images` builder (the IIFE around line 231), return only the front image
- Remove the two-step deferred front image upload block

**3. `supabase/functions/_shared/shopify-media-order.ts`**
- No changes needed — `ensureMediaOrder()` already short-circuits when `mediaNodes.length < 2`

### Technical Detail
```text
Current: POST /products.json { images: [back] } → sleep → POST images.json { front }
New:     POST /products.json { images: [front_only] }

Front image selection (determineFrontImageUrl):
  - PSA snapshot with IsFrontImage flag → that image
  - Comics with 2 images → image_urls[1]  
  - Default → image_urls[0]
```

