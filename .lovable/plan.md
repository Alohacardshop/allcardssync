

# Inventory UI Polish and Card Details Drawer

## Overview

This plan addresses two main requirements:
1. **UI Layout Polish (Part A)** - Clean up spacing, alignment, reduce visual noise in the header/filters, make the table more readable with sticky headers and consistent widths
2. **Card Details Drawer (Part B)** - Make rows clickable to open a comprehensive right-side drawer showing all item fields, with navigation and quick actions

---

## Part A: UI Layout Polish

### Current Issues Identified
- Header area has multiple stacked controls (Tabs, TruthMode badge, SystemStatus, ViewToggle, buttons) creating visual clutter
- Filter row can wrap awkwardly at certain widths
- Table already has sticky header but column widths could be more consistent
- Action buttons in header compete for attention

### Changes

#### 1. Consolidate Header Actions into Overflow Menu
**File: `src/features/inventory/pages/InventoryPage.tsx`**

Move less-used actions into a "More" dropdown menu:
- "Resync All from Shopify" button moves to overflow
- "Keyboard Shortcuts Help" moves to overflow
- Keep only essential controls visible: View Toggle, Saved Views, Column Chooser

```text
Before: [TruthMode] [SystemStatus] [ViewToggle] [Resync Button] [KeyboardHelp] [SavedViews] [ColumnChooser]
After:  [TruthMode] [SystemStatus] [ViewToggle] [SavedViews] [ColumnChooser] [More ...]
                                                                              └─ Resync All
                                                                              └─ Keyboard Shortcuts
```

#### 2. Standardize Filter Row Heights
**File: `src/features/inventory/components/InventoryFiltersBar.tsx`**

- All filter controls already use `h-9` - verify consistency
- Ensure flex wrapping is clean with `gap-2` and `flex-wrap`
- Active filter chips row gets consistent `min-h-[32px]` for visual stability

#### 3. Table Improvements
**File: `src/features/inventory/components/InventoryTableView.tsx`**

- Sticky header already implemented (line 621-646) - verify z-index is sufficient (`z-10` currently)
- Adjust column widths in `src/features/inventory/types/views.ts`:
  - Title: `minmax(220px, 1fr)` (slightly wider minimum)
  - Location: `120px` (accommodate nicknames)
  - Add `overflow-hidden text-ellipsis` to all text cells
- Ensure minimum table width prevents squishing: already `min-w-[1100px]`

#### 4. Container Width Utilization
**File: `src/features/inventory/pages/InventoryPage.tsx`**

- The main container uses `flex flex-col h-[calc(100vh-4rem)]` which is good
- Verify the table card uses full width with `w-full`

---

## Part B: Card Details Drawer

### Architecture

Create a new right-side Sheet that opens when clicking anywhere on a row (except checkbox). The drawer will:
- Show ALL available fields organized into logical sections
- Include quick actions (Resync, Print, eBay toggle)
- Support previous/next navigation within filtered list
- Lazy-load heavy data (images, snapshots) using existing `useInventoryItemDetail` hook

### New Components

#### 1. `src/features/inventory/components/ItemDetailsDrawer.tsx`

A new Sheet component with sections:

```text
+----------------------------------------------+
| [<Prev] Item Details                  [Next>] |
| SKU: ABC123                            [X]    |
+----------------------------------------------+
| [Image placeholder / actual images]           |
+----------------------------------------------+
| CORE INFO                                     |
| Title: 2021 Topps Chrome Shohei Ohtani #1     |
| SKU: ABC123                                   |
| Year: 2021 | Set: Topps Chrome                |
| Card #: 1 | Variant: Refractor               |
| Condition: PSA 10 | Category: TCG             |
+----------------------------------------------+
| INVENTORY                                     |
| Quantity: 5 | Price: $299.99 | Cost: $150.00  |
| Location: Windward (Aloha Card Shop...)       |
| Status: Active | Printed: Yes (2 hours ago)   |
+----------------------------------------------+
| SHOPIFY                                       |
| Status: [Synced] | Product ID: gid://...      |
| Last Sync: 2 hours ago                        |
| [Resync to Shopify]                           |
+----------------------------------------------+
| EBAY                                          |
| Listing: Listed | ID: 12345678               |
| [View on eBay] | [Remove from eBay]           |
+----------------------------------------------+
| PRINTING                                      |
| Status: Printed | Printed At: Jan 5, 2026     |
| [Print Label]                                 |
+----------------------------------------------+
| METADATA                                      |
| Created: Jan 1, 2026 | Updated: Jan 5, 2026   |
| Internal ID: uuid-...                         |
| Lot: LOT-2026-001                             |
+----------------------------------------------+
| [Copy Details]                                |
+----------------------------------------------+
```

#### 2. Row Click Handler

**File: `src/features/inventory/components/InventoryTableView.tsx`**

Modify `TableRow` to:
- Add `onClick` handler to the row container
- Check if click target is checkbox - if so, don't open drawer
- Pass `onOpenDetails` callback prop

```typescript
// In TableRow
const handleRowClick = (e: React.MouseEvent) => {
  // Don't open drawer if clicking checkbox or button
  const target = e.target as HTMLElement;
  if (target.closest('[role="checkbox"]') || target.closest('button')) {
    return;
  }
  onOpenDetails?.(item);
};
```

#### 3. Navigation Logic

Track current item index in filtered list for prev/next:
```typescript
const currentIndex = items.findIndex(i => i.id === selectedItemId);
const prevItem = currentIndex > 0 ? items[currentIndex - 1] : null;
const nextItem = currentIndex < items.length - 1 ? items[currentIndex + 1] : null;
```

#### 4. Copy Details Function

Generate clean text summary:
```typescript
const copyDetails = () => {
  const text = `
SKU: ${item.sku}
Title: ${generateTitle(item)}
Location: ${locationName}
Price: $${item.price}
Qty: ${item.quantity}
Shopify: ${item.shopify_sync_status || 'Not synced'}
eBay: ${item.ebay_sync_status || 'Not listed'}
  `.trim();
  navigator.clipboard.writeText(text);
  toast.success('Details copied to clipboard');
};
```

### Integration Points

#### State Management
**File: `src/features/inventory/pages/InventoryPage.tsx`**

Add new state:
```typescript
const [detailsDrawerItem, setDetailsDrawerItem] = useState<InventoryListItem | null>(null);
```

#### Pass to Table/Card Views
```typescript
onOpenDetails={(item) => setDetailsDrawerItem(item)}
```

#### Reuse Existing Handlers
The drawer will receive existing handlers as props:
- `onResync` - from `useInventoryActions`
- `onRemove` - existing removal flow
- Print action - trigger `setShowPrintDialog`
- eBay toggle - from `useEbayListing`

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/features/inventory/pages/InventoryPage.tsx` | Add overflow menu for header actions, add drawer state, pass handlers |
| `src/features/inventory/components/InventoryTableView.tsx` | Add row click handler, pass `onOpenDetails` |
| `src/features/inventory/components/InventoryCardView.tsx` | Add card click handler (similar pattern) |
| `src/features/inventory/components/InventoryFiltersBar.tsx` | Minor spacing adjustments |
| `src/features/inventory/types/views.ts` | Adjust column widths |

## New Files

| File | Purpose |
|------|---------|
| `src/features/inventory/components/ItemDetailsDrawer.tsx` | Main drawer component with all sections |
| `src/features/inventory/components/details/CoreInfoSection.tsx` | Core item info section |
| `src/features/inventory/components/details/InventorySection.tsx` | Quantity/price/location section |
| `src/features/inventory/components/details/ShopifySection.tsx` | Shopify sync status and actions |
| `src/features/inventory/components/details/EbaySection.tsx` | eBay listing status and actions |
| `src/features/inventory/components/details/PrintingSection.tsx` | Print status and action |
| `src/features/inventory/components/details/MetadataSection.tsx` | Timestamps and IDs |
| `src/features/inventory/components/details/ImageGallery.tsx` | Image display with placeholder |

---

## Technical Notes

### Performance
- Use existing `useInventoryItemDetail` hook for lazy loading heavy data (snapshots, images)
- Only fetch when drawer opens, not on every row render
- Sheet animation is smooth via Radix primitives

### Keyboard Navigation
- Escape closes drawer
- Left/Right arrows for prev/next (when drawer is open)
- Preserve existing keyboard shortcuts when drawer is closed

### Scroll Position Preservation
- Opening drawer should not affect scroll position
- Sheet overlay should not interfere with virtualizer

### Mobile Considerations
- Drawer should be full-width on mobile (`sm:max-w-lg` or similar)
- Consider bottom sheet pattern for mobile if needed (future enhancement)

