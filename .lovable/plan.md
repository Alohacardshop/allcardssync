

# Clean Up EbayBulkListing Component

Remove unused imports and state from `src/components/admin/EbayBulkListing.tsx`.

## Changes

**File: `src/components/admin/EbayBulkListing.tsx`**

1. **Remove `useMutation` from imports** (line 2) -- imported from `@tanstack/react-query` but never used
2. **Remove `Progress` from imports** (line 11) -- imported from `@/components/ui/progress` but never rendered
3. **Remove `importProgress` state** (line 68) -- `setImportProgress` is called during Shopify import but the value is never read or displayed

These are straightforward deletions with no impact on functionality.

