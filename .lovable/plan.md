

## Remaining Issues Found

### Issue 1: `initializeSystemViews` fires before auth is ready (console errors)

The `SavedViewsDropdown` component calls `initializeSystemViews.mutate()` inside a `useEffect` when `views.length === 0`. But the query returns `[]` when `userId` is undefined (line 29: `if (!userId) return []`), so the effect fires immediately — and the mutation throws "Not authenticated" because `userId` is still undefined.

**Fix**: Add a `userId` guard to the `useEffect` in `SavedViewsDropdown.tsx` line 66:
```
if (!isLoading && views.length === 0 && userId)
```
This requires passing `userId` availability from the hook or checking session in the component. Simplest: add `userId` check in the effect condition — the hook already returns when `!userId`.

### Issue 2: Test file imports non-existent hook `useShopifySyncQueue`

`tests/integration/shopify-sync-workflow.test.ts` imports `useShopifySyncQueue` from `@/hooks/useShopifySyncQueue` — this file doesn't exist. The test will fail at import time.

**Fix**: Either delete the test file (it's entirely mocked and tests fictional APIs) or create the missing hook. Given the test is fully mocked with no real integration value, recommend **deleting** it.

### Issue 3: Shopify webhook HMAC failures (orders/create, orders/fulfilled)

Logs show repeated `Invalid HMAC signature detected` for `orders/create` and `orders/fulfilled` from `hawaii_store`. The `orders/updated` topic works fine (HMAC verified). This means the webhook secret stored in `system_settings` as `SHOPIFY_HAWAII_WEBHOOK_SECRET` is correct, but Shopify may be sending different secrets per topic — or the secret was rotated after those webhook subscriptions were created.

**Fix**: This is a Shopify admin configuration issue, not a code bug. The webhook secret needs to be verified/updated in the Shopify admin panel. No code change needed — just flag it for you to check in Shopify admin.

### What's working correctly (confirmed)

- Tag backfill completed — 0 items with NULL `shopify_tags` and available metadata remain
- Sync queue clean — only 1 entry with status `completed` (the deleted item we cleaned up)
- `deleted_at` guard in `shopify-sync` processor is live
- Trigger generates tags on both INSERT and UPDATE
- `useAddIntakeItem` type-safe result handling works
- `useSendToInventory` triggers sync processor after queuing

---

### Implementation Plan

**Step 1**: Fix `SavedViewsDropdown.tsx` — add auth guard to the `useEffect` so `initializeSystemViews` only fires when the user is authenticated. Expose `isAuthenticated` or similar from the hook.

**Step 2**: Delete `tests/integration/shopify-sync-workflow.test.ts` — it imports a non-existent hook and tests fictional behavior with full mocks, providing no real coverage.

**Step 3**: No code change for webhook HMAC — note for you: check that your Shopify webhook secret in admin matches what's stored in `system_settings` for `SHOPIFY_HAWAII_WEBHOOK_SECRET`. The `orders/updated` topic verifies fine, but `orders/create` and `orders/fulfilled` fail, suggesting those webhook subscriptions may use a different secret.

