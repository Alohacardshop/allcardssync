

# Improve Print Status Indicator in Inventory Table

## Current State

The inventory table has a dedicated **Print Status** column showing badges:
- "Printed" (with primary styling) 
- "No Label" (muted outline)

This takes up horizontal space and may feel redundant since there's also Shopify and eBay status columns.

## Proposed Solution

Move the print status indicator to be a subtle visual marker **combined with the Shopify/eBay status area** or as a small icon near the actions column. This reduces a full column to a minimal indicator.

### Option: Merge into Status Area

Instead of a separate column, add a small printer icon next to the Shopify status:
- **Printed**: Show a small checkmark or filled printer icon 
- **Not Printed**: Show nothing (clean) or a subtle muted printer icon with tooltip

### Implementation Changes

#### 1. Remove the `print_status` Column from Default View
**File: `src/features/inventory/types/views.ts`**

Change `print_status` from `defaultVisible: true` to `defaultVisible: false` so it doesn't take up space by default, but remains toggleable for users who want it.

#### 2. Add Print Indicator to the Actions/Status Area
**File: `src/features/inventory/components/InventoryTableView.tsx`**

Add a small print indicator icon right before the kebab menu:
- If `printed_at` exists: Show a small `Printer` icon with a checkmark badge
- If not printed: No visual (keeps it clean)
- Tooltip on hover showing "Printed" or "Not printed"

### Visual Result

```
Before:
| SKU | Title | Location | Price | Qty | Shopify | Print   | eBay | Updated | Actions |
|     |       |          |       |     | Synced  | Printed | —    | 2h ago  | ... ⋮   |

After:
| SKU | Title | Location | Price | Qty | Shopify | eBay | Updated | 🖨️✓ | ⋮ |
|     |       |          |       |     | Synced  | —    | 2h ago  |     |   |
```

The print indicator becomes a small icon near the actions that only draws attention when printed (showing a checkmark) or on hover.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/features/inventory/types/views.ts` | Set `print_status` to `defaultVisible: false` |
| `src/features/inventory/components/InventoryTableView.tsx` | Add compact print indicator icon before kebab menu |

---

## Benefits

1. **Less visual noise** - Removes a full column's width
2. **Glanceable** - Small icon is easy to scan
3. **Optional detail** - Users can still enable the full column if needed
4. **Consistent** - Follows the pattern of putting secondary info near actions

