

# Deep Cleanup: Go-Live Readiness

## Summary

This plan performs a comprehensive cleanup to prepare the codebase for production, removing stale references, unused testing components, and deprecated edge functions. All E2E test infrastructure has already been removed, but several remnants remain.

---

## Phase 1: Fix Stale References

### 1. `src/pages/Admin.tsx` (Line 46)
**Issue**: Comment still says "8 sections with E2E testing" but E2E was removed

**Fix**: Update comment to "7 sections - consolidated admin layout"

```text
Before: // Consolidated sidebar - 8 sections with E2E testing
After:  // Consolidated sidebar - 7 sections
```

---

## Phase 2: Remove Shopify Testing Tab

The Store Management tabs include a **Testing** tab with 3 test components that are only used for development/debugging:

### Components to Remove:

| Component | File | Purpose |
|-----------|------|---------|
| `ShopifyIntegrationTest` | `src/components/admin/ShopifyIntegrationTest.tsx` | Tests Shopify API connectivity |
| `WebhookTestPanel` | `src/components/admin/WebhookTestPanel.tsx` | Fires test webhooks |
| `ShopifyQueueTest` | `src/components/admin/ShopifyQueueTest.tsx` | Tests queue workflow |

### Modification: `src/components/admin/StoreManagementTabs.tsx`

- Remove imports for the 3 test components
- Remove the "Testing" tab from TabsList (change from 5 to 4 columns)
- Remove the `<TabsContent value="testing">` section entirely

---

## Phase 3: Remove Edge Function Test Utilities

These edge functions are testing utilities that won't be needed in production:

| Function | Purpose | Action |
|----------|---------|--------|
| `shopify-webhook-test` | Fires synthetic webhook payloads | Delete |
| `shopify-test-webhook` | Tests HMAC, metafields, locations | Delete |

### Edge Functions to Keep:

| Function | Reason |
|----------|--------|
| `shopify-sync-dry-run` | **Keep** - Used by ShopifyForceSyncDialog for preview before actual sync |

---

## Phase 4: Clean Up Plan File

### `.lovable/plan.md`
**Issue**: Contains the old "Go Live" plan that has been executed

**Fix**: Clear the file contents (empty it out)

---

## Files to Delete

| File | Reason |
|------|--------|
| `src/components/admin/ShopifyIntegrationTest.tsx` | Testing component - not needed in production |
| `src/components/admin/WebhookTestPanel.tsx` | Testing component - not needed in production |
| `src/components/admin/ShopifyQueueTest.tsx` | Testing component - not needed in production |
| `supabase/functions/shopify-webhook-test/` | Test edge function - not needed in production |
| `supabase/functions/shopify-test-webhook/` | Test edge function - not needed in production |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Fix stale "8 sections with E2E testing" comment |
| `src/components/admin/StoreManagementTabs.tsx` | Remove Testing tab and its 3 component imports |
| `.lovable/plan.md` | Clear executed plan contents |

---

## Current Production Status (Verified)

| Store | sync_enabled | dry_run_mode | sync_mode |
|-------|--------------|--------------|-----------|
| Hawaii | false | **false** | manual |
| Las Vegas | false | **false** | manual |

All stores are configured correctly for production with manual sync control.

---

## What This Cleanup Achieves

1. **Removes ~750 lines of test-only code** from the frontend
2. **Deletes 2 test edge functions** that aren't needed in production
3. **Simplifies Store Management tabs** from 5 to 4 tabs
4. **Eliminates stale comments** referencing removed features
5. **Clears executed plan file** to avoid confusion

---

## Items Intentionally Kept

| Item | Reason |
|------|--------|
| `shopify-sync-dry-run` | Used for Force Sync preview - legitimate production feature |
| `QzTrayTestPage.tsx` | Hardware testing is a legitimate admin need |
| `TestHardwarePage.tsx` | Hardware connectivity testing is ongoing |
| Console logging | Kept for production debugging (can be controlled via log levels) |

