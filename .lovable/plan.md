

## Problem

The eBay Switch is being clipped/hidden in the narrow inspector panel. The `flex justify-between` layout breaks when:
1. The "Error" badge takes space between the label and switch
2. The long error text below further disrupts the layout
3. The panel is too narrow for all three elements on one line

## Solution: Rebuild Marketplace section with guaranteed layout

### Changes to `OverviewTab.tsx` — Marketplace section (lines 239-293)

Replace the current flex-based marketplace rows with a **card-based layout** using CSS Grid with fixed column widths, so the switch can never be pushed off-screen:

**Each marketplace row becomes a small card:**
```
┌──────────────────────────────────────┐
│ Shopify  [Synced]         [Resync ↻] │
├──────────────────────────────────────┤
│ eBay     [⚠ Error ⓘ]     [═══ ON ]  │
└──────────────────────────────────────┘
```

Key changes:
1. **Use `grid grid-cols-[1fr_auto_auto]`** instead of `flex justify-between` — this guarantees the switch always gets its space on the right regardless of content width
2. **Merge error into the badge itself** — instead of a separate error line below (which displaces content), show an "Error" badge with a tooltip icon. No separate error block at all. Hover the badge to see the full error message.
3. **Add `min-h-[40px]` to each row** so they're always tall enough to contain the switch
4. **Wrap the section in a bordered container** (`border rounded-lg p-3`) so it's visually distinct

### Error display strategy
- When `ebayStatus === 'error'`: Show `<Badge variant="destructive">Error <AlertCircle /></Badge>` — the entire badge is a tooltip trigger showing the full error on hover
- No separate error text block below the row — this eliminates the layout displacement entirely
- The error details remain available in the "Sync" tab for deep-dive

### Files to change
- `src/features/inventory/components/inspector/tabs/OverviewTab.tsx` — rebuild marketplace section with grid layout and inline error tooltip badge

