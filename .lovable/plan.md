
# Plan: Add Source Platform Indicator to Discord Notifications

## Goal
Add a clear source indicator (eBay or Shopify) to Discord notifications so staff can immediately see where each order came from.

## Current Behavior
- Notifications show "eBay Order", "Store Pickup", or "Online Order" based on tags
- No explicit "Source: Shopify" or "Source: eBay" field in the Discord embed

## Proposed Changes

### 1. Update `flush-pending-notifications/index.ts`

Add a new helper function and field to show order source:

```text
Add function: getOrderSource(payload)
  - Returns { emoji: string, label: string }
  - Logic:
    - If source_name === 'eBay' OR tags include 'ebay' OR payment_gateway_names includes 'EBAY'
      → { emoji: '🏷️', label: 'eBay' }
    - If source_name === 'web' OR source_name === 'online_store'
      → { emoji: '🛒', label: 'Shopify Website' }
    - If source_name === 'shopify_draft_order'
      → { emoji: '📝', label: 'Draft Order' }
    - Default
      → { emoji: '🛍️', label: 'Online' }
```

Update `buildOrderEmbed` function to add a Source field:
```text
fields.push({ 
  name: '🔗 Source', 
  value: `${sourceEmoji} ${sourceLabel}`, 
  inline: true 
});
```

### 2. Update `shopify-webhook/index.ts` (Optional Enhancement)

Ensure the immediate notifications (sent during business hours) also include the source indicator in the same format for consistency.

## Visual Result

**Before:**
```
🌺 Hawaii • New Online Order
## #1234
💰 Paid • 📋 Unfulfilled
👤 Customer: John    💵 Total: $99.99    📦 Type: Online Order
```

**After:**
```
🌺 Hawaii • New Online Order
## #1234
💰 Paid • 📋 Unfulfilled
👤 Customer: John    💵 Total: $99.99    📦 Type: Online Order
🔗 Source: 🛒 Shopify Website
```

For eBay orders:
```
🌺 Hawaii • New eBay Order
## 18-14167-10753
💰 Paid • 📋 Unfulfilled
👤 Customer: Thomas    💵 Total: $565.70    🏷️ Type: eBay Order
🔗 Source: 🏷️ eBay
```

## Technical Details

**Files to modify:**
1. `supabase/functions/flush-pending-notifications/index.ts` - Add source detection and display
2. `supabase/functions/shopify-webhook/index.ts` - Match source display for immediate notifications

**Data available in payload for source detection:**
- `payload.source_name`: "eBay", "web", "pos", etc.
- `payload.tags`: may include "ebay"
- `payload.payment_gateway_names`: ["EBAY"], ["shopify_payments"], etc.

## Testing

After deployment:
1. Wait for the next flush cycle (runs every 10 minutes)
2. Or manually trigger flush endpoint to verify formatting
3. Check that Hawaii pending orders display correct source

