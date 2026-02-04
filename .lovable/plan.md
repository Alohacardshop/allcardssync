
# Enhanced Test Data Cleanup

This update ensures all test records are properly cleaned up after E2E testing, preventing any data accumulation.

---

## Current State

### What's Already Cleaned Up
| Table | Status |
|-------|--------|
| `intake_items` (TEST-* SKUs) | ✅ Deleted |
| `ebay_sync_queue` (related entries) | ✅ Deleted |

### What's Missing from Cleanup
| Table | Issue |
|-------|-------|
| `shopify_sync_queue` | Not cleaned up |
| `ebay_sync_log` | Not cleaned up (logs with TEST-* SKUs) |
| `item_snapshots` | Not cleaned up (FK to intake_items) |
| `audit_log` | Not cleaned up (records with intake_items reference) |
| `cards` | Not cleaned up (if TEST-* SKUs exist) |

### Current Test Data
- 5 TEST-* items in `intake_items` (ready for cleanup)
- 0 related entries in other tables currently

---

## Solution

Enhance `cleanupTestItems` in `useE2ETest.ts` to delete from all related tables in the correct order (respecting foreign key constraints).

### Updated Cleanup Order

```text
1. ebay_sync_log (no FK, match by SKU)
2. ebay_sync_queue (no FK, match by item ID)
3. shopify_sync_queue (no FK, match by item ID)
4. item_snapshots (FK to intake_items)
5. audit_log (no FK, match by record_id)
6. cards (no FK, match by SKU)
7. intake_items (main table)
```

---

## Changes to `useE2ETest.ts`

### Enhanced cleanupTestItems Function

```typescript
const cleanupTestItems = useCallback(async () => {
  setState(s => ({ ...s, isCleaningUp: true }));
  
  try {
    const testItemIds = state.testItems.map(i => i.id);
    const testSkus = state.testItems.map(i => i.sku);
    
    if (testItemIds.length === 0) {
      toast.info('No test items to clean up');
      setState(s => ({ ...s, isCleaningUp: false }));
      return;
    }
    
    // 1. Remove eBay sync logs (by SKU)
    await supabase
      .from('ebay_sync_log')
      .delete()
      .in('sku', testSkus);
    
    // 2. Remove eBay queue entries
    await supabase
      .from('ebay_sync_queue')
      .delete()
      .in('inventory_item_id', testItemIds);
    
    // 3. Remove Shopify queue entries
    await supabase
      .from('shopify_sync_queue')
      .delete()
      .in('inventory_item_id', testItemIds);
    
    // 4. Remove item snapshots
    await supabase
      .from('item_snapshots')
      .delete()
      .in('intake_item_id', testItemIds);
    
    // 5. Remove audit log entries
    await supabase
      .from('audit_log')
      .delete()
      .eq('table_name', 'intake_items')
      .in('record_id', testItemIds.map(id => id.toString()));
    
    // 6. Remove cards entries (by SKU)
    await supabase
      .from('cards')
      .delete()
      .in('sku', testSkus);
    
    // 7. Finally, delete test items
    const { error } = await supabase
      .from('intake_items')
      .delete()
      .in('id', testItemIds);
    
    if (error) throw error;
    
    setState(s => ({
      ...s,
      testItems: [],
      isCleaningUp: false
    }));
    
    toast.success('Cleaned up all test items and related records');
  } catch (error) {
    console.error('Cleanup failed:', error);
    toast.error('Cleanup failed');
    setState(s => ({ ...s, isCleaningUp: false }));
  }
}, [state.testItems]);
```

---

## Optional: Auto-Cleanup on Page Unload

Add a warning when leaving the page with test items still present:

```typescript
useEffect(() => {
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    if (testItems.length > 0) {
      e.preventDefault();
      e.returnValue = 'You have test items that haven\'t been cleaned up.';
    }
  };
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  return () => window.removeEventListener('beforeunload', handleBeforeUnload);
}, [testItems.length]);
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useE2ETest.ts` | Expand cleanup to cover all related tables |
| `src/pages/E2ETestPage.tsx` | Add unload warning (optional) |

---

## Cleanup Summary Display

Update the cleanup card to show what will be deleted:

```tsx
<AlertDescription>
  This will permanently delete:
  • {testItems.length} test item(s) from intake_items
  • Related queue entries (eBay, Shopify)
  • Related logs and snapshots
</AlertDescription>
```

---

## Safety Verification

After implementing:
1. Generate test items
2. Sync to Shopify (dry run)
3. Queue for eBay and process (dry run)
4. Click "Delete All Test Items"
5. Verify all TEST-* records are gone from all tables
