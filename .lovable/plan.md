

## Problem Analysis

From the logs, our code reports `✅ PASSED` — Shopify's GraphQL says `uooA2qS1wUGojEweOijfpw.jpg` is featured. But the storefront still shows the wrong image. This means either:
1. Our front/back identification is inverted for this comic
2. Shopify's `productReorderMedia` mutation and `position` field don't actually control what the theme displays
3. There's a caching layer we can't bust

Your idea bypasses all of this by exploiting Shopify's behavior: **the last image uploaded tends to become the primary/featured image**.

## Plan: Two-Step Image Upload

### Changes to `shopify-sync/index.ts` — `createShopifyProduct()`

1. **Step 1: Create product with ONLY the back image** (the one we do NOT want as featured)
   - For comics with 2 images: send only `image_urls[0]` (the back) in the initial `products.json` POST
   - For non-comics or items with `psa_snapshot`: use existing logic

2. **Step 2: Wait 1-2 seconds, then add the front image via a separate API call**
   - Use `POST /products/{id}/images.json` to add the front image after creation
   - Set `position: 1` on this second image to explicitly make it the primary

3. **Still run `ensureMediaOrder()` afterward** as a verification/safety net, but the two-step upload should make it unnecessary

### Changes to `_shared/shopify-media-order.ts` — `determineFrontImageUrl()`

4. **Flip the comic logic**: Currently returns `imageUrls[1]` for comics. Based on the DB data and the user's feedback, `imageUrls[0]` (`aUqBDKB97kG9I7fq4MKSZQ.jpg`) is actually the front cover. We need to verify this with the user — but the two-step approach makes this less critical since position is controlled by upload order.

### Also apply same logic to `v2-shopify-send-graded/index.ts`

5. Port the two-step upload to the graded send function for consistency.

### Technical Details

```text
Current flow:
  POST /products.json  { images: [front, back] }  →  Shopify picks its own order
  POST GraphQL reorder  →  sometimes ignored by theme

New flow:
  POST /products.json  { images: [back_only] }     →  back uploaded first
  sleep(1500ms)
  POST /products/{id}/images.json  { src: front, position: 1 }  →  front becomes primary
  (optional) GraphQL reorder verification
```

