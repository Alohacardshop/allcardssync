
# E2E Test Dashboard Redesign: Split Panel Sync Interface

## Overview

Transform the current step-by-step card layout into a modern split-panel interface where:
- **Left Panel**: Inventory items with filters, search, and multi-select
- **Right Panel**: Marketplace destinations (Shopify, eBay, Print) showing sync status and actions

This creates an intuitive "source → destination" workflow similar to file transfer UIs.

---

## Visual Design

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  E2E Test Dashboard                                      [Safety Toggles]   │
├─────────────────────────────────────┬───────────────────────────────────────┤
│  TEST ITEMS                         │  DESTINATIONS                         │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────────────┐  │
│  │ 🔍 Search...    [Filters ▼] │    │  │ SHOPIFY            [Dry Run ✓] │  │
│  └─────────────────────────────┘    │  │ ├─ 3 synced                     │  │
│                                     │  │ └─ [Sync Selected →]            │  │
│  [Select All] [Clear]  3 selected   │  └─────────────────────────────────┘  │
│  ┌─────────────────────────────┐    │  ┌─────────────────────────────────┐  │
│  │ ☑ TEST-ABC-001  Graded  ✓S │    │  │ EBAY                [Dry Run ✓] │  │
│  │ ☑ TEST-DEF-002  Raw     ⏳E │    │  │ ├─ 2 queued, 1 synced           │  │
│  │ ☑ TEST-GHI-003  Graded  ✓S │    │  │ └─ [Queue →] [Process Queue]    │  │
│  │ ☐ TEST-JKL-004  Raw        │    │  └─────────────────────────────────┘  │
│  └─────────────────────────────┘    │  ┌─────────────────────────────────┐  │
│                                     │  │ PRINT               [Dry Run ✓] │  │
│  ┌─────────────────────────────┐    │  │ ├─ Printer: Zebra ZD420         │  │
│  │ Generate: [1] [3] [5]       │    │  │ └─ [Print Selected]             │  │
│  │ [🗑 Delete All Test Items]  │    │  └─────────────────────────────────┘  │
│  └─────────────────────────────┘    │                                       │
├─────────────────────────────────────┴───────────────────────────────────────┤
│  Store: Hawaii  │  Location: gid://shopify/...                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `E2ETestLayout.tsx` | Main split-panel layout using ResizablePanelGroup |
| `E2EItemsPanel.tsx` | Left panel - items list with filters and selection |
| `E2EDestinationsPanel.tsx` | Right panel - marketplace sync cards |
| `E2EDestinationCard.tsx` | Individual marketplace card (Shopify/eBay/Print) |
| `E2EItemRow.tsx` | Individual item row with status icons |

### Component Structure

```text
E2ETestPage
├── E2ETestLayout
│   ├── ResizablePanelGroup (horizontal)
│   │   ├── ResizablePanel (left - items)
│   │   │   └── E2EItemsPanel
│   │   │       ├── Search + Filters
│   │   │       ├── Selection controls
│   │   │       ├── ScrollArea with E2EItemRow items
│   │   │       └── Generate/Cleanup actions
│   │   │
│   │   ├── ResizableHandle
│   │   │
│   │   └── ResizablePanel (right - destinations)
│   │       └── E2EDestinationsPanel
│   │           ├── E2EDestinationCard (Shopify)
│   │           ├── E2EDestinationCard (eBay)
│   │           └── E2EDestinationCard (Print)
│   │
│   └── Footer (store/location info)
```

---

## Left Panel: Items Panel

### Features

1. **Search bar** - Filter items by SKU, title, or cert number
2. **Filter dropdown** - Filter by:
   - Type: All / Graded / Raw
   - Status: All / Created / Synced / Failed
3. **Bulk selection** - Select All / Clear / Count display
4. **Item list** - Scrollable with checkbox selection
5. **Item row shows**:
   - Checkbox for selection
   - SKU badge
   - Type badge (Graded/Raw)
   - Status icons: S (Shopify), E (eBay), P (Printed)
   - Error indicator with tooltip
6. **Generation buttons** - Quick 1/3/5 graded or raw generation
7. **Cleanup section** - Delete all test items

---

## Right Panel: Destinations Panel

### Shopify Card
- Dry run toggle
- Stats: X synced, Y failed
- Button: "Sync Selected (N)" - syncs selected items
- Progress indicator when syncing

### eBay Card  
- Dry run status (read from config)
- Stats: X queued, Y synced, Z failed
- Button: "Queue Selected (N)" - adds to queue
- Button: "Process Queue" - triggers processor
- Progress indicator when processing

### Print Card
- Dry run toggle
- Printer selector (QZ Tray connection)
- Stats: X printed
- Button: "Print Selected (N)"
- Warning if no default template

---

## Item Status Icons

Each item shows compact status indicators:

| Icon | Meaning |
|------|---------|
| `✓S` | Synced to Shopify (green) |
| `⏳S` | Syncing to Shopify (yellow, animated) |
| `✗S` | Shopify sync failed (red) |
| `✓E` | Synced to eBay (green) |
| `⏳E` | Queued/processing eBay (yellow) |
| `✗E` | eBay sync failed (red) |
| `✓P` | Printed (green) |

---

## State Management

Keep using `useE2ETest` hook but add:

```typescript
// New filter state in the hook
filters: {
  search: string;
  type: 'all' | 'graded' | 'raw';
  status: 'all' | 'created' | 'shopify_synced' | 'ebay_synced' | 'failed';
}

// Computed filtered items
filteredItems = useMemo(() => {
  return testItems.filter(item => {
    // Apply search and filter logic
  });
}, [testItems, filters]);
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/e2e/E2ETestLayout.tsx` | Create | Main split-panel layout |
| `src/components/e2e/E2EItemsPanel.tsx` | Create | Left panel with items |
| `src/components/e2e/E2EDestinationsPanel.tsx` | Create | Right panel with destinations |
| `src/components/e2e/E2EDestinationCard.tsx` | Create | Individual marketplace card |
| `src/components/e2e/E2EItemRow.tsx` | Create | Compact item row with status |
| `src/components/e2e/E2EStatusIcons.tsx` | Create | Status icon components |
| `src/pages/E2ETestPage.tsx` | Refactor | Use new layout components |
| `src/hooks/useE2ETest.ts` | Extend | Add filtering logic |

---

## Implementation Order

1. Create base layout with ResizablePanelGroup
2. Build E2EItemRow component with status icons
3. Build E2EItemsPanel with search, filters, and item list
4. Build E2EDestinationCard component
5. Build E2EDestinationsPanel with Shopify/eBay/Print cards
6. Wire up to existing useE2ETest hook
7. Add filtering logic to hook
8. Refactor E2ETestPage to use new components

---

## Technical Considerations

- **Responsive**: On mobile, stack panels vertically
- **Keyboard**: Support Shift+Click for range selection
- **Performance**: Keep virtualization for large item lists
- **Accessibility**: Proper ARIA labels for selection and actions
- **Error handling**: Show toast + inline error badges

---

## Mobile Layout

On screens < 768px, switch to tabbed interface:

```text
┌─────────────────────────────┐
│  [Items] [Destinations]     │  ← Tabs
├─────────────────────────────┤
│  (Current tab content)      │
└─────────────────────────────┘
```
