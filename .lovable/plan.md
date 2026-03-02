

## Findings

The eBay switch **is rendering** — session replay confirms it was toggled on/off. The likely issue is **visual contrast on the dark theme**: the unchecked Switch uses `bg-input` which blends into the dark background, making it appear invisible.

The eBay sync itself failed due to the Accept-Language header issue, which was already fixed and deployed.

## Plan

### 1. Make the Switch more visible on dark theme (EbayTab.tsx)
- Add a visible border/outline to the Switch when unchecked so it stands out on dark backgrounds
- Add `border border-border` class to the Switch component so it's always visible regardless of theme

### 2. Make the toggle section more prominent (EbayTab.tsx)
- Add a stronger background to the toggle container (`bg-muted/50` instead of `bg-muted/30`)
- Add a border to the container to make the whole section more noticeable

### 3. Reset stale error state when re-enabling (useEbayListing.ts)
- When toggling `list_on_ebay` back to `true`, also clear `ebay_sync_error` so the old error doesn't persist and confuse the UI
- Update line 18-21 to include `ebay_sync_error: null` when enabling

**Files to change:**
- `src/features/inventory/components/inspector/tabs/EbayTab.tsx` — add border/contrast to Switch
- `src/hooks/useEbayListing.ts` — clear error on re-enable

After these changes, toggle the switch back on for item SKU 146094215 to test the fixed eBay sync.

