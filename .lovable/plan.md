

## Deep Dive: Editing an Item — Why It Only Saves Locally

### How the Edit Flow Works

```text
User clicks field in Inspector OverviewTab
  → EditableField.onSave(value)
  → InspectorPanel.handleFieldSave({ [field]: value })
  → useInventoryFieldSync.updateField(item, updates)
     │
     ├─ Step 1: UPDATE intake_items in local DB  ✅ Works
     │
     ├─ Step 2: IF shopify_product_id + sync_status='synced' + store_key
     │    → supabase.functions.invoke('shopify-update-product')  ❌ 401
     │
     └─ Step 3: IF price changed + ebay_listing_id
          → supabase.functions.invoke('ebay-update-inventory')   ❌ 401
```

### Root Cause: Gateway-Level 401 on `shopify-update-product`

The analytics logs confirm every POST to `shopify-update-product` returns **401** — and the function produces **zero logs** (no `console.log` output). This means Supabase's gateway is rejecting the request **before** the function code executes.

The `config.toml` sets `verify_jwt = false` for this function (line 108), but **`config.toml` only applies to local development** — the deployed Supabase project controls JWT verification independently. On the hosted project, this function likely still has `verify_jwt = true`, so the gateway validates the JWT token. If the user's session token has any issue (expired, malformed), it gets rejected at the gateway.

**The same 401 pattern appears across multiple functions**: `ebay-sync-processor`, `catalog-turbo-worker`, and `shopify-update-product` — all returning 401. Meanwhile, `process-retry-jobs` (which has `verify_jwt = false`) returns 200. This confirms the issue is gateway JWT verification, not the function's internal auth logic.

### Fix

Since `shopify-update-product` already does its own auth validation internally (lines 43-49: `supabaseUser.auth.getUser()`), the gateway-level JWT check is redundant. The function should be deployed with `--no-verify-jwt` to match the `config.toml` setting, allowing the function's own auth logic to handle validation.

However, **Lovable's deploy tool doesn't support the `--no-verify-jwt` flag**. So instead:

1. **Remove the internal auth check** from `shopify-update-product` — let the gateway handle JWT verification (since it's `verify_jwt = true` on the server)
2. **Switch from user-scoped to service-role client** for reading `intake_items` (the gateway already validated the user's JWT, so we know they're authenticated)
3. **Keep the service-role client** for `system_settings` reads (already using it)

This means the function trusts the gateway's JWT validation and uses the service-role client for all DB operations, which also avoids RLS issues on `intake_items` reads.

### Specific Changes

**`supabase/functions/shopify-update-product/index.ts`:**
- Remove the `supabaseUser` client and `auth.getUser()` check (lines 36-49)
- Use `supabaseAdmin` (service-role) for all DB reads including `intake_items`
- The gateway's JWT verification provides the auth layer

**No changes needed to:**
- `useInventoryFieldSync.ts` — client-side code is correct
- `EditableField.tsx` / `OverviewTab.tsx` — UI is correct
- `ebay-update-inventory` — separate issue (also 401, same gateway problem)

### Why `ebay-update-inventory` Also Gets 401

Same gateway JWT verification issue. This function also needs the same treatment, but it's a separate fix since it uses `serve()` from the old Deno std library. Both functions should be updated to rely on gateway auth and use service-role clients.

### Summary

| Component | Status | Issue |
|-----------|--------|-------|
| EditableField UI | ✅ Working | — |
| OverviewTab wiring | ✅ Working | — |
| useInventoryFieldSync local DB save | ✅ Working | — |
| shopify-update-product invocation | ❌ 401 | Gateway JWT rejection |
| ebay-update-inventory invocation | ❌ 401 | Gateway JWT rejection |
| shopify-update-product credentials | ✅ Fixed | Now reads from system_settings |
| shopify-update-product variant rename | ✅ Fixed | cardVariant collision resolved |

**Plan: Update both `shopify-update-product` and `ebay-update-inventory` to remove internal auth checks and use service-role clients for all DB operations, relying on the Supabase gateway's JWT verification as the auth layer. Redeploy both functions.**

