

## Fix Image Order and Enforce Graded Quantity = 1

### Problem 1: Wrong Image Order
PSA returns images as `[back/slab, front]`. The code currently picks only the first image (the back). Shopify should show the front image first.

**Fix**: Send ALL images from `image_urls` to Shopify, but reverse the array so the front image comes first. PSA consistently returns back-of-slab as first image and front as second.

### Problem 2: Quantity Sent as 2
Graded items are 1-of-1 per the inventory truth contract. The code blindly uses `item.quantity || 1`, which sent 2 because the DB had quantity=2.

**Fix**: Force `quantity = 1` for graded items regardless of what the database or input says.

### Changes

**File: `supabase/functions/v2-shopify-send-graded/index.ts`**

1. **Images (lines 349-353)**: Instead of sending a single `imageUrl`, build an images array from `intakeItem.image_urls` (reversed so front is first). Fall back to single `imageUrl` if no array exists.

2. **Quantity (line 341)**: Hard-code `inventory_quantity: 1` — graded items are always 1-of-1.

3. **Inventory write (line 435)**: Change `quantity: item.quantity || 1` to `quantity: 1` for the same reason.

### Technical Detail

```
// Images: reverse PSA order [back, front] → [front, back]
const allImages = (intakeItem.image_urls && Array.isArray(intakeItem.image_urls) && intakeItem.image_urls.length > 0)
  ? [...intakeItem.image_urls].reverse().map(url => ({ src: url, alt: title }))
  : imageUrl ? [{ src: imageUrl, alt: title }] : []

// In productData:
images: allImages

// Variant quantity:
inventory_quantity: 1  // Graded = 1-of-1, always

// writeInventory call:
quantity: 1  // Graded = 1-of-1, always
```

