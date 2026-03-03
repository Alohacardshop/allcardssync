

## Fix: TCGplayer Photo URLs Not Being Stored

**Root Cause:** The `create_raw_intake_item` database function extracts images from `catalog_snapshot_in` by looking for keys `imageUrls` or `imageUrl`. But the TCGPlayer bulk import stores the photo URL under `image_urls` and `photo_url` — neither of which the RPC checks. So the image data is silently dropped.

### Changes

**1. Database Migration: Update `create_raw_intake_item` to also check `image_urls` and `photo_url` keys**

Add two additional checks in the image extraction logic:

```sql
-- Existing checks for imageUrls / imageUrl ...
-- Add: check for image_urls array key
ELSIF catalog_snapshot_in ? 'image_urls' AND jsonb_typeof(catalog_snapshot_in->'image_urls') = 'array' THEN
  SELECT array_agg(elem::text) INTO v_image_urls
  FROM jsonb_array_elements_text(catalog_snapshot_in->'image_urls') AS elem;
-- Add: check for photo_url string key
ELSIF catalog_snapshot_in ? 'photo_url' THEN
  v_image_urls := ARRAY[catalog_snapshot_in->>'photo_url'];
```

**2. Backfill existing TCGplayer-imported items that have the URL in catalog_snapshot but NULL image_urls**

```sql
UPDATE intake_items
SET image_urls = to_jsonb(ARRAY[catalog_snapshot->>'photo_url'])
WHERE source_provider = 'tcgplayer'
  AND image_urls IS NULL
  AND catalog_snapshot->>'photo_url' IS NOT NULL;
```

No frontend changes needed — the photo URL is already correctly parsed and passed in `catalog_snapshot_in`. The fix is entirely in the database function.

