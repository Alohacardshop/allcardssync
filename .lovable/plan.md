

## Plan: Add "List All eBay Locations" and Fix Multi-Store Support

### Problem
- The edge function uses `.single()` on `ebay_store_config` but you have 2 active configs (hawaii + las_vegas), causing it to crash.
- There's no way to list all merchant locations registered on your eBay account.

### Changes

**1. Update `supabase/functions/ebay-manage-location/index.ts`**

- Accept a `store_key` query parameter (e.g., `?store_key=hawaii`) to select which store config to use, instead of `.single()`.
- Add a new action via query param `?action=list` that calls `GET /sell/inventory/v1/location` (no key suffix) to return **all** locations registered on that eBay account.
- Keep the existing `?action=verify` (default GET) behavior for checking a specific `location_key`.

**2. Update `src/components/admin/EbayMerchantLocation.tsx`**

- Pass the current `storeKey` as a prop alongside `locationKey`.
- Add a "List All Locations" button that calls the edge function with `action=list`.
- Display the returned locations in a table/list showing each location's key, name, address, and status.
- The existing Verify and Register buttons continue to work as before.

**3. Update `src/pages/EbayApp.tsx`**

- Pass `storeKey={selectedConfig.store_key}` to `EbayMerchantLocation`.

### How it works

The eBay Inventory API endpoint `GET /sell/inventory/v1/location` (without a specific key) returns all registered merchant locations. The edge function will call this and return the full list. The UI will render them so you can see exactly what's registered.

### Files to change
- `supabase/functions/ebay-manage-location/index.ts` — add `store_key` param, add `action=list`
- `src/components/admin/EbayMerchantLocation.tsx` — add list UI, accept `storeKey` prop
- `src/pages/EbayApp.tsx` — pass `storeKey` prop

