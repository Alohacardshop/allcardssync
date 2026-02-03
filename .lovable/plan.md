

## Comprehensive Code Review and Cleanup Plan

After reviewing the entire codebase, I've identified several categories of cleanup and improvements that will streamline the internal app.

---

### Summary of Findings

| Category | Count | Impact |
|----------|-------|--------|
| Unused Files (Pages/Components) | 9 | Remove dead code, reduce bundle size |
| Duplicate Components | 2 | Consolidate to single source of truth |
| Unused Hooks | 3 | Remove complexity |
| Dead Code References | 4 | Clean up unused state/imports |
| Consolidation Opportunities | 2 | Simplify codebase structure |

---

### Phase 1: Remove Completely Unused Files

These files have NO imports anywhere in the codebase:

| File | Reason |
|------|--------|
| `src/pages/MobileInventory.tsx` | Never imported or routed to |
| `src/pages/AdminEnhanced.tsx` | Never imported or routed to - orphaned admin page |
| `src/pages/admin/LabelStudio.tsx` | Never imported or routed to |
| `src/components/RawCardIntake.tsx` | No imports found - superseded by TCGPlayerBulkImport |
| `src/components/BulkCardIntake.tsx` | No imports found - superseded by other intake forms |
| `src/components/RawCardSearch.tsx` | No imports found - superseded by TCGCardSearch |
| `src/components/SetupWizard.tsx` | No imports found - 488 lines of unused code |
| `src/components/accessibility/AccessibilityProvider.tsx` | Never imported or used |
| `src/hooks/useShopifyValidation.ts` | No imports found |
| `src/hooks/useShopifySyncConflicts.ts` | No imports found |

---

### Phase 2: Remove Duplicate Components

**Duplicate SystemHealthCard:**

Two components export the same name:
- `src/components/SystemHealthCard.tsx` - Used by DashboardPage and ShopifySync (uses useHealthMonitor)
- `src/components/admin/SystemHealthCard.tsx` - Only used by AdminEnhanced (uses usePollingWithCircuitBreaker)

Since AdminEnhanced is being deleted, we can keep only `src/components/SystemHealthCard.tsx` and delete the admin version.

---

### Phase 3: Clean Up Dead Imports in Inventory.tsx

The file currently has 1531 lines. Clean up:

| Item | Issue |
|------|-------|
| `sendGradedToShopify, sendRawToShopify` | Imported but could be removed if using batch send only |
| `Download` icon | Imported but appears unused |

---

### Phase 4: Remove Orphaned Catalog Components

Since catalog syncing moved to external service:

| File | Action |
|------|--------|
| `src/components/catalog/SyncMonitor.tsx` | Keep - still used by AdminEnhanced, but AdminEnhanced is deleted |

After deleting AdminEnhanced, verify SyncMonitor has no remaining imports, then delete.

---

### Phase 5: Clean Up Empty Lines and Formatting

Fix formatting issues from previous cleanup that left empty lines:

- `src/hooks/useInventoryListQuery.ts` - Lines 10, 35, 49, 51 have stray empty lines from removed code
- `src/pages/Inventory.tsx` - Lines 217, 234 have stray empty lines from removed code

---

### Files to Delete (10 files)

```
src/pages/MobileInventory.tsx
src/pages/AdminEnhanced.tsx
src/pages/admin/LabelStudio.tsx
src/components/RawCardIntake.tsx
src/components/BulkCardIntake.tsx
src/components/RawCardSearch.tsx
src/components/SetupWizard.tsx
src/components/accessibility/AccessibilityProvider.tsx
src/hooks/useShopifyValidation.ts
src/hooks/useShopifySyncConflicts.ts
```

---

### Files to Modify

**1. `src/hooks/useInventoryListQuery.ts`**
- Remove empty lines at lines 10, 35, 49, 51

**2. `src/pages/Inventory.tsx`**
- Remove empty lines at lines 217, 234
- Evaluate if `sendGradedToShopify` and `sendRawToShopify` imports are still needed
- Remove unused `Download` import if not used

**3. Delete orphaned admin catalog component after AdminEnhanced removal:**
- `src/components/catalog/SyncMonitor.tsx` (verify no remaining imports first)
- `src/components/admin/SystemHealthCard.tsx` (duplicate of root component)

---

### Verification Steps Before Deletion

For each file marked for deletion, I will:
1. Search for all import statements referencing the file
2. Confirm zero matches
3. Delete the file

---

### What This Cleanup Achieves

- **Removes ~3,500 lines** of unused code
- **Eliminates 10 dead files** that serve no purpose
- **Consolidates duplicates** (SystemHealthCard)
- **Cleans up formatting** from previous edits
- **Reduces cognitive load** - fewer files to navigate

---

### Files Intentionally Kept

These were reviewed but should remain:

| File | Reason to Keep |
|------|---------------|
| `src/lib/soundEffects.ts` | Used by BulkTransferScanner |
| `src/lib/zebraTestUtils.ts` | Used for printer testing |
| `src/lib/zplToPdf.ts` | Used by PDFLabelPreview |
| `src/lib/labelDesignerSettings.ts` | Used by useRawTemplates |
| `src/hooks/useExternalTCG.ts` | Used by RawCardSearch (but RawCardSearch being deleted - needs recheck) |
| `src/hooks/useTCGData.ts` | Used by TCGPlayerBulkImport, TCGCardSearch |
| `src/hooks/useHealthMonitor.ts` | Used by SystemHealthCard |
| `src/hooks/usePollingWithCircuitBreaker.ts` | Used by PricingJobsMonitor, admin SystemHealthCard |
| `src/lib/fns.ts` | Contains parseFunctionError utility - used for error handling |

---

### Technical Implementation

**Deletion order:**
1. Delete unused pages first (MobileInventory, AdminEnhanced, LabelStudio)
2. Delete unused components (RawCardIntake, BulkCardIntake, RawCardSearch, SetupWizard, AccessibilityProvider)
3. Delete unused hooks (useShopifyValidation, useShopifySyncConflicts)
4. Delete newly-orphaned files after parent deletion (SyncMonitor if orphaned, admin/SystemHealthCard)
5. Clean up formatting in remaining files

**Parallel safety:** All deletions are independent and can be done in parallel since none of the files reference each other.

