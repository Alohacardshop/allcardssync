

## Problem

The `location_key` in `ebay_store_config` is set to `"hawaii"`, but eBay's API returns "Location information not found" — meaning the actual registered merchant location on your eBay account uses a **different key**. Since you have active listings, the location definitely exists; we just need to discover its real key.

## Plan

### 1. Create `ebay-manage-location` edge function

A simple edge function that queries eBay's Inventory Location API to:
- **GET**: List all registered merchant locations on the account — returns the actual `merchantLocationKey` values so we can find the correct one
- **POST**: Optionally create/update a location if needed

File: `supabase/functions/ebay-manage-location/index.ts`

Uses existing `getValidAccessToken` and `ebayApiRequest` from `_shared/ebayApi.ts`.

### 2. Add config entry to `supabase/config.toml`

```toml
[functions.ebay-manage-location]
verify_jwt = true
```

### 3. Deploy and invoke

After deploying, we call it to list your eBay locations. Once we see the actual key, we update `ebay_store_config.location_key` to match, and the "Location information not found" error goes away.

### Files to create/change
- **Create**: `supabase/functions/ebay-manage-location/index.ts`
- **Edit**: `supabase/config.toml` — add function entry

