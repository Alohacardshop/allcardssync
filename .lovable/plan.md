

## Plan: Prevent Duplicate Offers + Fix Merchant Location Key

### Problem
1. `processCreate` (line 576) always calls `POST /offer` without checking if an offer already exists for that SKU, causing "Offer entity already exists" errors on retries.
2. The merchant location key is already sourced from `storeConfig.location_key` (line 594), but if it's unregistered, the error isn't handled gracefully.

### Changes (single file: `supabase/functions/ebay-sync-processor/index.ts`)

**Fix 1: Check for existing offers before creating (lines ~575-599)**

Replace the direct `createOffer` call with:
1. Call `getOffersBySku(accessToken, environment, ebaySku)` first
2. If an offer exists: `updateOffer` with current template values (categoryId, price, policies, merchantLocationKey, quantity), store the existing `offerId`, then `publishOffer`
3. If no offer exists: `createOffer` as before, then `publishOffer`

**Fix 2: Handle error 25002 (merchant location not registered)**

After the offer create/update step, if the result contains error 25002 or the string "Merchant location not registered":
- Surface a clear error message: `"Merchant location '${locationKey}' is not registered on eBay. Go to Admin → eBay → Locations and click 'Register Location', or call ebay-manage-location POST."`
- This is already partially handled in the shared `createOffer` function (it detects 25002), but we should also check it in the update path

**Fix 3: Also pass `merchantLocationKey` in `processUpdate` offer update (line ~811-828)**

The existing `processUpdate` calls `updateOffer` but doesn't include `merchantLocationKey`. Add it so location changes propagate on updates too.

### Summary of edits
| Location | Change |
|----------|--------|
| `processCreate` lines 575-602 | Add `getOffersBySku` check; if exists → `updateOffer` + `publishOffer`; if not → `createOffer` + `publishOffer` |
| `processUpdate` line 811-828 | Add `merchantLocationKey` to the offer update payload |
| No new files needed | All changes in `ebay-sync-processor/index.ts` |

