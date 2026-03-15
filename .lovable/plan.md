

# Hide Comics and eBay Features for Las Vegas Users

## What Needs Gating

Based on the codebase audit, here are the areas that still expose comic or eBay features to Las Vegas users:

### eBay (8 areas)

1. **Dashboard Home** (`src/pages/DashboardHome.tsx`) -- The "eBay" app card is shown to all admins regardless of region. Should be hidden when `services.ebay_sync` is false.

2. **Sidebar/Header Navigation** (`src/config/navigation.ts`) -- The "eBay" nav item appears for all admins. Should be filtered out when eBay sync is disabled.

3. **Inventory Table -- eBay column** (`src/features/inventory/components/InventoryTableView.tsx`) -- The `ebay_status` column and `EbayStatusBadge` are shown for all users. Should be hidden when eBay is off.

4. **Inventory Card Header** (`src/components/inventory-card/InventoryItemHeader.tsx`) -- Shows `EbayStatusBadge` on every card. Should be hidden.

5. **Inspector Panel -- eBay Tab** (`src/features/inventory/components/inspector/InspectorPanel.tsx`) -- The "Sync" tab includes `EbayTab`. The eBay section should be hidden.

6. **Item Details Drawer -- eBay Section** (`src/features/inventory/components/ItemDetailsDrawer.tsx`) -- Renders `EbaySection` for every item. Should be hidden.

7. **Bulk Actions Toolbar** (`src/components/inventory/BulkActionsToolbar.tsx`) -- "eBay +" and "eBay -" buttons, and the "eBay" option in the Resync dropdown. Should be hidden when eBay is off.

8. **Overview Tab -- eBay status/toggle** (`src/features/inventory/components/inspector/tabs/OverviewTab.tsx`) -- Shows eBay status badge and toggle button. Should be hidden.

### Comics (3 areas)

9. **PSA Bulk Import category selector** (`src/components/PSABulkImport.tsx`) -- The "Comics" option in the Main Category dropdown should be hidden when comics are disabled.

10. **Edit Intake Item Dialog** (`src/components/EditIntakeItemDialog.tsx`) -- The "Comics" option in the Main Category dropdown should be hidden.

11. **Inventory Overview Tab** -- The eBay section already covers this, but comic-specific fields (CGC/PSA comic layouts) will naturally not appear since no comic items exist. No extra gating needed.

## Approach

- Create a shared hook or use the existing `useRegionSettings` to check both `services.ebay_sync` and `services.comics_enabled` flags.
- Pass an `ebayEnabled` boolean to inventory components, either via prop drilling from the inventory page or by calling `useRegionSettings` directly in each component.
- For navigation/routing, filter out eBay items when the setting is false.
- All changes are purely UI-level -- the data stays intact, just hidden from view.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/DashboardHome.tsx` | Filter out eBay card when `ebay_sync` is false |
| `src/config/navigation.ts` or consuming components | Filter eBay nav item based on region setting |
| `src/features/inventory/components/InventoryTableView.tsx` | Hide `ebay_status` column |
| `src/components/inventory-card/InventoryItemHeader.tsx` | Hide `EbayStatusBadge` |
| `src/features/inventory/components/inspector/InspectorPanel.tsx` | Hide `EbayTab` section |
| `src/features/inventory/components/ItemDetailsDrawer.tsx` | Hide `EbaySection` |
| `src/components/inventory/BulkActionsToolbar.tsx` | Hide eBay bulk buttons and resync option |
| `src/features/inventory/components/inspector/tabs/OverviewTab.tsx` | Hide eBay status and toggle |
| `src/components/PSABulkImport.tsx` | Hide "Comics" category option |
| `src/components/EditIntakeItemDialog.tsx` | Hide "Comics" category option |

