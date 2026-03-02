

## Two Issues Found

### 1. Tooltip clipped by overflow
The error tooltip on `EbayStatusBadge` uses `side="top"` with `max-w-[200px]`. When rendered near the top of the inventory list, it gets clipped by the parent container's `overflow: hidden`. Fix: increase `max-w` for readability, and add `z-50` + `sideOffset` to ensure it floats above. Also switch to `side="bottom"` so it doesn't clip under the header row.

**File:** `src/components/inventory/EbayStatusBadge.tsx` (line 85)
- Change `side="top"` to `side="bottom"` 
- Add `className="z-50 ..."` and `sideOffset={6}` so it clears the row
- Widen `max-w` to `300px` so error messages aren't truncated

### 2. eBay API: "Invalid value for header Accept-Language"
The `ebayApiRequest` function in `_shared/ebayApi.ts` does not send an `Accept-Language` header. The eBay Inventory API (production) requires a valid one. The error is `errorId: 25709`.

**File:** `supabase/functions/_shared/ebayApi.ts` (line 160-164)
- Add `'Accept-Language': 'en-US'` to the headers object
- Add `'Content-Language': 'en-US'` as well (required by some eBay sell APIs)

After this fix, redeploy `ebay-sync-processor` and `ebay-create-listing`.

### Technical Details
- The `Accept-Language` header tells eBay which locale to use for response messages. Production eBay enforces it on inventory endpoints; sandbox was lenient.
- The tooltip z-index issue is a common Radix UI pattern where `TooltipContent` portals to `<body>` but visually appears under sticky/fixed headers due to stacking context.

