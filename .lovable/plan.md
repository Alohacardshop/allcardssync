
# Tag-Based Inventory System with Auto-Sync to Shopify

## Summary

This plan consolidates the inventory system around **normalized tags** as the source of truth and ensures that **tag edits made locally automatically sync to Shopify**. It also fixes the current UI overlapping issues.

---

## Current State Analysis

### What Works
- `TagEditor` component exists and saves tags to `intake_items.shopify_tags`
- A database trigger (`trigger_normalize_tags`) auto-normalizes tags on insert/update
- The `shopify-tag-manager` edge function exists to update tags in Shopify
- Quick Filter Presets use normalized tags for filtering

### What's Missing
1. **No auto-sync to Shopify**: When tags are edited in TagEditor, they only update locally—Shopify products keep old tags
2. **UI Overlap Issues**: QuickFilterPresets card and Filters card create visual clutter; BulkActionsToolbar may overlap on smaller screens
3. **TagEditor doesn't trigger Shopify sync**: After saving tags, there's no call to push changes to Shopify

---

## Implementation Plan

### Phase 1: Fix UI Layout Issues

**Problem**: Multiple stacked cards (QuickFilterPresets, Filters) create visual clutter and overlap.

**Solution**: Consolidate into a single, well-structured filter section.

**Changes to `src/pages/Inventory.tsx`**:
- Merge QuickFilterPresets into the main filter Card header
- Use a horizontal scrollable container for quick presets on mobile
- Ensure proper spacing between filter rows and bulk actions
- Add `overflow-hidden` containers to prevent visual overlap

```text
Layout Structure:
┌─────────────────────────────────────────────────────┐
│ Quick Filters (horizontal scroll on mobile)        │
│ [Pokemon] [Sports] [Graded] [Sealed] [Sync Errors] │
├─────────────────────────────────────────────────────┤
│ [Search........] [Status ▼] [Location ▼] [Filters] │
├─────────────────────────────────────────────────────┤
│ Bulk Actions (only when items selected)            │
├─────────────────────────────────────────────────────┤
│ Showing X of Y items                   [Select All]│
└─────────────────────────────────────────────────────┘
```

### Phase 2: Auto-Sync Tags to Shopify

**Trigger Point**: When `TagEditor.handleSave()` completes successfully

**Flow**:
```text
User edits tags → Save to intake_items → DB trigger normalizes → 
  → If item has shopify_product_id → Call edge function to update Shopify tags
```

**Changes to `src/components/inventory/TagEditor.tsx`**:

1. Accept new props: `shopifyProductId`, `storeKey`, `onShopifySync`
2. After local save succeeds, if `shopifyProductId` exists:
   - Call `shopify-tag-manager` edge function to sync tags to Shopify
   - Show "Syncing to Shopify..." state
   - Show success/error toast

```typescript
// New handleSave flow
const handleSave = async () => {
  setIsSaving(true);
  try {
    // 1. Save to local database
    const { error } = await supabase
      .from('intake_items')
      .update({ shopify_tags: tags, updated_at: new Date().toISOString() })
      .eq('id', itemId);
    if (error) throw error;

    // 2. If synced to Shopify, push tags there too
    if (shopifyProductId && storeKey) {
      setSyncingToShopify(true);
      try {
        const { error: shopifyError } = await supabase.functions.invoke('shopify-tag-manager', {
          body: {
            action: 'replace',  // New action type for full replacement
            tags: tags,
            productId: shopifyProductId,
            storeKey: storeKey
          }
        });
        if (shopifyError) throw shopifyError;
        toast.success('Tags synced to Shopify');
      } catch (shopifyErr) {
        toast.warning('Tags saved locally, but Shopify sync failed');
        console.error('Shopify tag sync failed:', shopifyErr);
      } finally {
        setSyncingToShopify(false);
      }
    } else {
      toast.success('Tags updated');
    }
    
    setIsOpen(false);
    queryClient.invalidateQueries({ queryKey: ['inventory-list'] });
    onTagsUpdated?.();
  } catch (error) {
    toast.error(error.message || 'Failed to update tags');
  } finally {
    setIsSaving(false);
  }
};
```

### Phase 3: Enhance Edge Function for Tag Replacement

**Current limitation**: `shopify-tag-manager` only supports `add` and `remove` actions.

**Changes to `supabase/functions/shopify-tag-manager/index.ts`**:

Add a `replace` action that completely replaces all product tags:

```typescript
interface TagOperation {
  action: 'add' | 'remove' | 'replace';
  tags: string[];
  productId: string;
  storeKey: string;
}

// In handler:
if (action === 'replace') {
  // Complete replacement - set exactly these tags
  updatedTags = tags;
} else if (action === 'add') {
  updatedTags = [...new Set([...currentTags, ...tags])];
} else {
  updatedTags = currentTags.filter(t => !tags.includes(t));
}
```

### Phase 4: Update InventoryItemCard Integration

**Changes to `src/components/InventoryItemCard.tsx`**:

Pass required props to TagEditor for Shopify sync:

```typescript
<TagEditor
  itemId={item.id}
  currentTags={item.shopify_tags || []}
  normalizedTags={item.normalized_tags || []}
  shopifyProductId={item.shopify_product_id}
  storeKey={item.store_key}
/>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Inventory.tsx` | Merge QuickFilterPresets into filter Card, fix spacing/overflow |
| `src/components/inventory/TagEditor.tsx` | Add Shopify auto-sync after local save |
| `src/components/InventoryItemCard.tsx` | Pass `shopifyProductId` and `storeKey` to TagEditor |
| `supabase/functions/shopify-tag-manager/index.ts` | Add `replace` action for full tag replacement |

---

## Technical Details

### TagEditor Props Interface (Updated)

```typescript
interface TagEditorProps {
  itemId: string;
  currentTags: string[];
  normalizedTags?: string[];
  // NEW: For Shopify auto-sync
  shopifyProductId?: string | null;
  storeKey?: string | null;
  onTagsUpdated?: () => void;
  className?: string;
}
```

### Shopify Tag Manager - Replace Action

When `action: 'replace'` is used:
1. Fetch current product to verify it exists
2. Completely replace tags (no merge)
3. Return success with new tag list

### UI Layout Fixes

1. **Single Card for all filters**: Combine QuickFilterPresets header with filter dropdowns
2. **Flex wrap with gap**: Prevent button overflow
3. **Responsive breakpoints**: Stack vertically on mobile
4. **Clear visual hierarchy**: Use subtle borders between sections

---

## Expected Behavior After Implementation

1. **User edits tags in TagEditor** → Tags saved to local DB → Normalized by trigger → Auto-synced to Shopify
2. **Quick filters work correctly** → Based on normalized_tags from local DB
3. **No UI overlap** → Clean single-card layout with proper spacing
4. **Real-time feedback** → User sees "Syncing to Shopify..." indicator during sync

---

## Edge Cases Handled

1. **Item not yet synced to Shopify**: Tags saved locally only, no Shopify call
2. **Shopify sync fails**: Local save succeeds, warning toast shown, tags can be re-synced later
3. **Empty tags**: Valid case, will clear all tags from product
4. **Network timeout**: Graceful degradation with retry on next edit
