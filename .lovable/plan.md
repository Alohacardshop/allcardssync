
## Add Auto-Save to eBay Settings

### Problem
Currently, selecting policies and other settings in the eBay Settings tab only updates local React state. Users must manually click "Save Configuration" to persist changes to the database. This led to your policy selections being lost.

### Solution
Implement automatic saving with debouncing so changes persist immediately after selection, with visual feedback showing save status.

---

### Implementation Details

**1. Add Debounced Auto-Save to `updateConfig`**

Modify the `updateConfig` function to automatically persist changes to the database after a short delay (500ms debounce to batch rapid changes):

```typescript
// Add new state for auto-save status
const [autoSaving, setAutoSaving] = useState(false);
const saveTimeoutRef = useRef<NodeJS.Timeout>();

// Replace updateConfig with auto-saving version
const updateConfig = useCallback((updates: Partial<EbayStoreConfig>) => {
  if (!selectedConfig) return;
  
  const newConfig = { ...selectedConfig, ...updates };
  setSelectedConfig(newConfig);
  
  // Clear existing timeout
  if (saveTimeoutRef.current) {
    clearTimeout(saveTimeoutRef.current);
  }
  
  // Debounced auto-save
  saveTimeoutRef.current = setTimeout(async () => {
    setAutoSaving(true);
    try {
      await supabase
        .from('ebay_store_config')
        .update({
          environment: newConfig.environment,
          marketplace_id: newConfig.marketplace_id,
          is_active: newConfig.is_active,
          default_category_id: newConfig.default_category_id,
          default_fulfillment_policy_id: newConfig.default_fulfillment_policy_id,
          default_payment_policy_id: newConfig.default_payment_policy_id,
          default_return_policy_id: newConfig.default_return_policy_id,
          title_template: newConfig.title_template,
          description_template: newConfig.description_template
        })
        .eq('id', newConfig.id);
      
      toast.success('Settings saved', { duration: 2000 });
    } catch (error: any) {
      toast.error('Failed to save: ' + error.message);
    } finally {
      setAutoSaving(false);
    }
  }, 500);
}, [selectedConfig]);
```

**2. Add Saving Indicator**

Replace the manual "Save Configuration" button with an auto-save status indicator:

```tsx
{/* Auto-save status indicator */}
<div className="flex justify-end items-center gap-2 text-sm text-muted-foreground">
  {autoSaving ? (
    <>
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Saving...</span>
    </>
  ) : (
    <>
      <CheckCircle className="h-4 w-4 text-green-500" />
      <span>All changes saved</span>
    </>
  )}
</div>
```

**3. Cleanup on Unmount**

Add cleanup to prevent memory leaks:

```typescript
useEffect(() => {
  return () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  };
}, []);
```

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/EbayApp.tsx` | Add `autoSaving` state, `saveTimeoutRef`, replace `updateConfig` with debounced version, replace save button with status indicator, add cleanup effect |

---

### User Experience

| Before | After |
|--------|-------|
| Select policy from dropdown | Select policy from dropdown |
| Nothing happens visually | "Saving..." appears briefly |
| User forgets to click Save | "All changes saved" confirms persistence |
| Changes lost on navigation | Changes persist immediately |

---

### Technical Notes

- **Debounce Duration**: 500ms provides good balance between responsiveness and avoiding excessive API calls
- **Toast Duration**: Short 2-second toast to avoid notification fatigue
- **Dependency**: Uses `useCallback` to prevent infinite re-renders while maintaining access to latest `selectedConfig`
- **No Breaking Changes**: Existing `saveConfig` function retained for any edge cases
