

# Go Live: Remove E2E Testing & Disable Dry-Run Mode

## Summary

This plan will:
1. **Remove** the E2E Test Dashboard and all related test components
2. **Disable dry-run mode** so eBay syncs will push real changes when triggered
3. **Keep manual sync only** - no auto-sync, users choose what gets listed

---

## Current State

| Store | sync_enabled | dry_run_mode | sync_mode |
|-------|--------------|--------------|-----------|
| Hawaii | false | true | manual |
| Las Vegas | false | true | manual |

**After this change:**

| Store | sync_enabled | dry_run_mode | sync_mode |
|-------|--------------|--------------|-----------|
| Hawaii | false | **false** | manual |
| Las Vegas | false | **false** | manual |

This means:
- Items **won't auto-queue** (sync_enabled = false)
- When you manually trigger sync, it **will push real changes** to eBay (dry_run = false)
- Syncs only happen **when you click the button** (manual mode)

---

## Files to Delete

| File | Description |
|------|-------------|
| `src/pages/E2ETestPage.tsx` | Main test dashboard page |
| `src/components/e2e/E2ETestLayout.tsx` | Split-panel layout |
| `src/components/e2e/E2EItemsPanel.tsx` | Left panel - items list |
| `src/components/e2e/E2EDestinationsPanel.tsx` | Right panel - destinations |
| `src/components/e2e/E2EDestinationCard.tsx` | Marketplace card component |
| `src/components/e2e/E2EItemRow.tsx` | Item row component |
| `src/components/e2e/E2EStatusIcons.tsx` | Status icon components |
| `src/hooks/useE2ETest.ts` | Test hook with state management |
| `src/lib/testDataGenerator.ts` | Synthetic test data generator |

---

## Files to Modify

### 1. `src/App.tsx`
- Remove import: `const E2ETestPage = React.lazy(() => import("./pages/E2ETestPage"));`
- Remove route: `<Route path="e2e-test" element={<E2ETestPage />} />`

### 2. `src/pages/Admin.tsx`  
- Remove the E2E Testing link from the sidebar (lines 223-233)

---

## Database Update

Run via the `ebay-update-store-config` Edge Function or direct SQL:

```sql
UPDATE ebay_store_config 
SET dry_run_mode = false 
WHERE store_key IN ('hawaii', 'las_vegas');
```

This turns off dry-run so syncs become real eBay API calls.

---

## What This Means for Users

1. **No test dashboard** - The `/admin/e2e-test` page will no longer exist
2. **Real eBay syncs** - When items are queued and processed, they will create actual eBay listings
3. **Manual control** - Users must explicitly:
   - Flag items with `list_on_ebay = true`
   - Use the Sync Queue Monitor to process queued items
   - Or create sync rules to auto-flag by category/price/etc.

---

## Safety Notes

- **sync_enabled stays FALSE** - Items won't auto-queue
- **No auto-sync** - Nothing happens without user action
- **Sync rules optional** - Can add tag/category rules later when ready
- **Queue Monitor** - Still available at `/admin/ebay` → Sync Queue tab

