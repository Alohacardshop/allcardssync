
## Hide Auto-Refresh UI (Keep Background Refresh)

The auto-refresh functionality is handled by React Query in `useInventoryListQuery.ts` - it automatically refreshes data every 15-60 seconds based on sync status. The visible `RefreshControls` component just displays the countdown and toggle switch, which you'd like to hide.

### Changes

**File: `src/pages/Inventory.tsx`**

1. **Remove the RefreshControls import** (line 25)
2. **Enable auto-refresh by default** - set `autoRefreshEnabled` to `true` permanently
3. **Remove the RefreshControls component** from the UI (around lines 1284-1292)
4. **Keep the manual refresh button** (the "Resync from Shopify" button already exists and will remain)

The result:
- Auto-refresh continues silently in the background (every 15-60 seconds depending on pending syncs)
- No progress bar or countdown timer visible
- No toggle switch cluttering the UI
- Manual refresh is still available via the existing "Resync from Shopify" button

### Technical Details

The background refresh logic in `useInventoryListQuery.ts` will continue to work:

| Scenario | Refresh Interval |
|----------|-----------------|
| Pending syncs (queued/processing) | 15 seconds |
| Normal browsing | 60 seconds |
| Tab hidden | 5 minutes |
| User has items selected | Paused |

No changes needed to the query hook - just removing the UI component that exposes the toggle.
