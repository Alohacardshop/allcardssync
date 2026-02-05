
# Location Nicknames Display System

## Summary
Create a centralized location nickname helper that maps Shopify location names to short, memorable nicknames (e.g., "Aloha Card Shop Windward Mall" → "Windward"). Display nicknames prominently across the UI with full names in tooltips on hover.

---

## Nickname Mappings

| Full Shopify Location Name | Nickname |
|---------------------------|----------|
| Aloha Card Shop Windward Mall | Windward |
| Aloha Card Shop Kahala | Kahala |
| Aloha Card Shop Ward Warehouse | Ward Warehouse |
| (any other location) | Full name (no shortening) |

---

## Changes

### 1. Create Centralized Nickname Helper

**New file: `src/lib/locationNicknames.ts`**

```typescript
// Location nickname mappings for display
const LOCATION_NICKNAMES: Record<string, string> = {
  'Aloha Card Shop Windward Mall': 'Windward',
  'Aloha Card Shop Kahala': 'Kahala', 
  'Aloha Card Shop Ward Warehouse': 'Ward Warehouse',
};

// Get nickname from full name (or return full name if no match)
export function getLocationNickname(fullName: string): string

// Get nickname from GID using locationsMap
export function getLocationNicknameFromGid(
  gid: string | null | undefined,
  locationsMap: Map<string, CachedLocation> | undefined
): { nickname: string; fullName: string }
```

### 2. Update `useLocationNames.ts`

Replace the existing `getShortLocationName` function to use the new nickname system:
- Import `getLocationNickname` from `locationNicknames.ts`
- Update `getShortLocationName` to call `getLocationNickname(fullName)` instead of `fullName.split(' ')[0]`
- Add `getLocationDisplayInfo` export that returns both nickname and full name for tooltip use

### 3. Update `useInventoryLevels.ts` → `enrichLevelsWithNames`

Modify the `enrichLevelsWithNames` function to include both `displayName` (nickname) and `fullName` for tooltip:
- Add `fullName` property alongside `displayName`
- Use nickname logic for `displayName`

### 4. Update UI Components

#### A. `InventoryItemHeader.tsx` (Card view badge)
- Wrap the location badge in a `Tooltip`
- Display nickname in the badge
- Show full name on hover

#### B. `LocationStockPopover.tsx` (Table hover card)
- Update trigger to show nickname with tooltip
- Update popover list to show nicknames with full names accessible

#### C. `StockByLocationSection.tsx` (Item detail panel)
- Show nickname as primary display
- Add tooltip with full name
- Update `level.displayName` usage to use new nickname

#### D. `InventoryTableView.tsx` (Table location column)
- `LocationStockPopover` already uses `getShortLocationName` - will inherit changes
- Verify tooltip shows full name

#### E. `BulkTransferScanner.tsx` & `TransferHistoryLog.tsx`
- Update `getLocationNameFromGid` usage in `src/lib/locationUtils.ts` to support nickname display
- Add tooltip for full name where space is limited

### 5. Update `src/lib/locationUtils.ts`

Add nickname-aware variants:
- `getLocationNicknameFromGid()` for compact display
- Keep `getLocationNameFromGid()` as-is for full name access

---

## Technical Details

| File | Change Type |
|------|-------------|
| `src/lib/locationNicknames.ts` | **New** - Centralized nickname config + helpers |
| `src/hooks/useLocationNames.ts` | **Edit** - Update `getShortLocationName`, add `getLocationDisplayInfo` |
| `src/hooks/useInventoryLevels.ts` | **Edit** - Add `fullName` to enriched levels |
| `src/lib/locationUtils.ts` | **Edit** - Add nickname helper |
| `src/components/inventory-card/InventoryItemHeader.tsx` | **Edit** - Add tooltip around location badge |
| `src/components/inventory/LocationStockPopover.tsx` | **Edit** - Use nickname with tooltip |
| `src/components/inventory/StockByLocationSection.tsx` | **Edit** - Use nickname with tooltip |
| `src/components/BulkTransferScanner.tsx` | **Edit** - Update to use nickname with tooltip |
| `src/components/TransferHistoryLog.tsx` | **Edit** - Update to use nickname with tooltip |

---

## Affected UI Areas

- **Inventory Table**: Location column shows nickname, hover reveals full name
- **Inventory Cards**: Location badge shows nickname with tooltip
- **Item Detail Panel**: Stock by Location section shows nicknames with tooltips
- **Location Popover**: Hover card shows nicknames with full names
- **Bulk Transfer Scanner**: Source/destination show nicknames with tooltips
- **Transfer History Log**: Location names show nicknames with tooltips

---

## Fallback Behavior

When a location name doesn't match any known nickname:
1. Display the full Shopify location name (no truncation)
2. Tooltip shows the same full name (for consistency)

This ensures no information is ever lost for unknown locations.
