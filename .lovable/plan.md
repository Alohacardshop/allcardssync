

## Unified Inventory Hub: Filter, List, and Print

This plan transforms the inventory system into a single, unified hub where all items can be filtered, listed to Shopify/eBay, and have barcodes printed—all from one interface.

---

### Current State

**What exists today:**
- **Inventory page** (`/inventory`): Browse items with filters for type, status, batch, and print status. Can sync to Shopify and toggle eBay flags. No barcode printing.
- **Barcode Printing page** (`/barcode-printing`): Pull items from Shopify, filter by date/tags/category, and print barcodes. No marketplace listing actions.
- Both pages query the same `intake_items` table but operate independently.

**Gap identified:**
- No way to filter by "not synced to Shopify" or "not synced to eBay" 
- No barcode printing from the main Inventory page
- Marketplace listing and barcode printing are separate workflows

---

### Proposed Solution

Create a unified "Operations Hub" that combines filtering, marketplace listing, and barcode printing into one streamlined workflow.

---

### Implementation Details

**Phase 1: Enhanced Filters on Inventory Page**

Add new filter dropdowns to `useInventoryListQuery.ts` and the Inventory UI:

| Filter | Options | Database Column |
|--------|---------|-----------------|
| Shopify Sync | All, Not Synced, Synced, Error | `shopify_product_id`, `shopify_sync_status` |
| eBay Status | All, Not Listed, Listed, Queued, Error | `ebay_listing_id`, `ebay_sync_status` |
| Print Status | All, Printed, Not Printed | `printed_at` |
| Game/Sport | Dynamic from main_category | `main_category` |
| Date Added | Today, Yesterday, 7 Days, 30 Days, Custom | `created_at` |

**Phase 2: Unified Bulk Actions Toolbar**

Enhance `BulkActionsToolbar.tsx` to include all operations:

```
┌─────────────────────────────────────────────────────────────────┐
│  ☑ Select All (125)  │  Clear Selection  │  87 selected         │
├─────────────────────────────────────────────────────────────────┤
│  [🛒 List to Shopify]  [📦 List to eBay]  [🏷️ Print Barcodes]  │
│  [↻ Resync Selected]   [🗑️ Delete Selected (admin)]            │
└─────────────────────────────────────────────────────────────────┘
```

- **List to Shopify**: Queues selected unsynced items for Shopify sync
- **List to eBay**: Sets `list_on_ebay=true` and optionally queues for immediate listing
- **Print Barcodes**: Opens template selector dialog and prints selected items

**Phase 3: Barcode Printing Integration**

Add printing capability directly to the Inventory page:

1. Create `PrintFromInventoryDialog.tsx` component:
   - Template selector dropdown (reuse from PulledItemsFilter)
   - Copy count input
   - "Mark as printed" toggle
   - Print button with progress indicator

2. Wire into BulkActionsToolbar print action

3. Reuse existing print infrastructure:
   - `printQueue.enqueueSafe()` from `@/lib/print/queueInstance`
   - `zplFromTemplateString()` for template rendering
   - `label_templates` table for templates

**Phase 4: Quick Filter Presets**

Add one-click filter presets above the main filter panel:

```
┌────────────────────────────────────────────────────────────────┐
│  Quick Filters:                                                 │
│  [📋 Ready to Sync]  [⚠️ Sync Errors]  [🏷️ Needs Barcode]      │
│  [📦 Not on eBay]    [📅 Today's Intake]  [🧹 Clear All]       │
└────────────────────────────────────────────────────────────────┘
```

Each preset sets multiple filters at once:
- **Ready to Sync**: `shopify_product_id IS NULL` + `deleted_at IS NULL`
- **Sync Errors**: `shopify_sync_status = 'error'`
- **Needs Barcode**: `printed_at IS NULL` + `deleted_at IS NULL`
- **Not on eBay**: `ebay_listing_id IS NULL` + `list_on_ebay = false`
- **Today's Intake**: `created_at >= today`

---

### File Changes Summary

| File | Changes |
|------|---------|
| `src/hooks/useInventoryListQuery.ts` | Add new filter parameters for Shopify sync, eBay status |
| `src/pages/Inventory.tsx` | Add new filter dropdowns, print button handler, quick presets |
| `src/components/inventory/BulkActionsToolbar.tsx` | Add Print Barcodes button |
| `src/components/inventory/PrintFromInventoryDialog.tsx` | NEW: Print dialog with template selection |
| `src/components/inventory/QuickFilterPresets.tsx` | NEW: Quick filter preset buttons |
| `src/components/inventory/InventoryFilters.tsx` | NEW: Extract filter UI into separate component for clarity |

---

### Technical Notes

**Database columns used:**
- `shopify_product_id` - NULL means not synced to Shopify
- `shopify_sync_status` - 'pending', 'success', 'error', 'synced'
- `ebay_listing_id` - NULL means not listed on eBay
- `ebay_sync_status` - 'pending', 'queued', 'processing', 'synced', 'error'
- `list_on_ebay` - boolean flag for eBay eligibility
- `printed_at` - timestamp when barcode was printed
- `main_category` - 'tcg', 'comics', 'sports', etc.
- `created_at` - when item was added to intake

**Existing hooks to reuse:**
- `useBatchSendToShopify` - for bulk Shopify sync
- `useEbayListing.bulkToggleEbay()` - for bulk eBay flagging
- `useEbayListing.queueForEbaySync()` - for queueing eBay listings
- `printQueue.enqueueSafe()` - for printing

---

### User Workflow After Implementation

1. Navigate to `/inventory`
2. Click **"Needs Barcode"** quick preset (filters to unprinted items)
3. Select desired items using checkboxes
4. Click **"Print Barcodes"** → select template → print
5. Click **"Ready to Sync"** preset (filters to un-synced items)
6. Select items → click **"List to Shopify"**
7. For eBay, use **"Not on eBay"** preset → select → click **"List to eBay"**

All operations in one place, with smart filters to quickly find items needing action.

