

## Problem Analysis

The inspector panel's tabbed layout is the root cause. Burying eBay controls in a separate tab means:
- Users must click to a different tab just to toggle one switch
- Errors in that tab push content around in a narrow panel
- The switch keeps "disappearing" because it's hidden behind a tab click

The fix isn't more CSS tweaks on the eBay tab. It's restructuring what goes where.

## Proposed Changes

### 1. Move marketplace toggles into the Overview tab

Put both Shopify sync status and eBay toggle directly in the Overview tab under a new "Marketplace" section. This makes the eBay switch always visible when inspecting an item -- no tab switching required.

The new section in `OverviewTab.tsx` will show:
- **Shopify row**: status badge + "Resync" button (inline)
- **eBay row**: status badge + Switch toggle (inline) + compact error (if any)

### 2. Merge Shopify + eBay tabs into a single "Sync" tab

Replace the separate Shopify and eBay tabs with one combined "Sync" tab for detailed sync information (IDs, timestamps, error logs). This is the "deep dive" view, while the Overview tab has the quick-action controls.

Changes to `InspectorPanel.tsx`:
- Remove the "eBay" tab trigger
- Rename "Shopify" tab to "Sync"
- Render both ShopifyTab and EbayTab details inside the Sync tab content

### 3. Add marketplace section to OverviewTab

New section in `OverviewTab.tsx` between "Inventory" and the sync indicator:

```text
┌─ Marketplace ────────────────────────┐
│ Shopify   [Synced]        [Resync ↻] │
│ eBay      [Error]         [═══ ON ]  │
│   ⚠ "Failed to create..." (tooltip)  │
└──────────────────────────────────────┘
```

### 4. Simplify tab bar

Go from 5 tabs → 4 tabs:
- Overview (now includes marketplace controls)
- Sync (combined Shopify + eBay details)
- Printing
- History

### Files to change

- `src/features/inventory/components/inspector/tabs/OverviewTab.tsx` -- add Marketplace section with eBay switch and Shopify resync
- `src/features/inventory/components/inspector/InspectorPanel.tsx` -- merge Shopify+eBay tabs, pass onResync/isResyncing to OverviewTab
- `src/features/inventory/components/inspector/tabs/ShopifyTab.tsx` -- add eBay details below existing Shopify details (combined "Sync" tab)
- `src/features/inventory/components/inspector/tabs/EbayTab.tsx` -- keep as-is for the detailed view, but also export a compact `EbayQuickToggle` component for use in OverviewTab

