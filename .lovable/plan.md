

## Problem

The inspector panel's `item` is stored in `useState<InventoryListItem>` as a **snapshot** taken when the row was clicked. When you edit a field (e.g., price), `useInventoryFieldSync` saves to the DB and invalidates the `inventory-list` query. The **list row** re-renders with fresh data from the query, but the **inspector** still holds the stale snapshot — so it shows the old price ($222) while the row shows the new price ($200).

## Fix

In `InventoryPage.tsx`, add an effect that keeps `inspectorItem` in sync with the latest `items` array. When the query refetches and `items` updates, find the matching item by ID and update the inspector state.

```typescript
// After items change (e.g., query refetch), sync inspector with latest data
useEffect(() => {
  if (!inspectorItem) return;
  const fresh = items.find(i => i.id === inspectorItem.id);
  if (fresh) {
    setInspectorItem(fresh);
  } else {
    // Item was removed from the list (filtered out, deleted, etc.)
    setInspectorItem(null);
  }
}, [items]);
```

This single effect in `InventoryPage.tsx` resolves the stale data for all fields (price, subject, year, etc.) across the entire inspector.

