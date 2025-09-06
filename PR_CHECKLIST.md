# PR Description Checklist

Copy and paste this checklist into your PR description to verify the intake DB-only refactor:

---

## ✅ Intake DB-Only Verification Checklist

- [ ] **Network**: On Add to Batch, only RPC calls; no `/functions/v1/*`.

- [ ] **DB**: `public.intake_items` shows the new row; no Shopify triggers exist.

- [ ] **Preflight**: Toast shows `hasStaff=true`, `canAccessLocation=true`.

- [ ] **E2E**: Intake test passes (no functions invoked).

- [ ] **Inventory path**: Moving to inventory still invokes `/functions/v1/shopify-sync-inventory`.

- [ ] **CI**: `npm run check:intake-no-shopify` passes.

---

### Manual Testing Steps

1. **Login as staff user** with store/location assignments
2. **Open browser DevTools** → Network tab
3. **Navigate to Graded Card Intake** or Raw Card Intake
4. **Click "Check Access Now"** → verify toast shows access granted
5. **Fill out form and click "Add to Batch"**
6. **Verify Network tab** shows:
   - ✅ `POST /rest/v1/rpc/create_raw_intake_item` 
   - ❌ NO requests to `/functions/v1/shopify-*`
7. **Check batch list** → new item appears
8. **Move item from batch to inventory** → verify Shopify sync call fires

### Database Verification

Run the SQL smoke test:
```sql
-- In Supabase SQL Editor
\i sql/debug/rls_intake_validate.sql
```

Expected results:
- `user_can_access_store_location()` returns `TRUE`
- `debug_eval_intake_access()` shows `has_staff: true, can_access_location: true`
- Dummy insert succeeds and rolls back cleanly

### CI/E2E Verification

```bash
# Guardrail check
npm run check:intake-no-shopify  # Should pass

# E2E tests  
npx playwright test tests/intake_add_to_batch.spec.ts      # 0 function calls
npx playwright test tests/inventory_send_to_shopify.spec.ts # 1+ function calls
```