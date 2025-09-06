# Branch & Commit Plan

## Branch
`fix/intake-batch-definer-rpc`

## Commits (in order)

### 1. `feat(sql): make create_raw_intake_item SECURITY DEFINER with internal access check`
- Replace existing RPC function with SECURITY DEFINER version
- Add internal access check using `user_can_access_store_location` with named args
- Use `btrim()` on inputs to handle whitespace issues
- Set `created_by := auth.uid()` for ownership tracking

### 2. `chore(sql): revoke direct INSERT; grant execute on RPC`  
- `REVOKE INSERT ON public.intake_items FROM authenticated`
- `GRANT EXECUTE ON FUNCTION public.create_raw_intake_item(...) TO authenticated`
- Drop legacy INSERT RLS policies (no longer needed)
- Force clients to use authoritative RPC

### 3. `feat(rls): users see their items or assigned items; admins see all`
- Add `created_by` column to `public.intake_items` 
- Create unified SELECT policy:
  - Admins see everything (`has_role(..., 'admin')`)
  - Users see their own items (`created_by = auth.uid()`)
  - Users see items from assigned locations (`user_can_access_store_location(...)`)

### 4. `test(e2e): add Playwright tests for intake and inventory flows`
- `tests/intake_add_to_batch.spec.ts` - verify 0 function calls on batch add
- `tests/inventory_send_to_shopify.spec.ts` - verify Shopify sync on inventory move
- Playwright config and CI integration

### 5. `ci(guardrails): add intake-no-shopify check and GitHub workflow`
- `scripts/check-intake-no-shopify.sh` - block Shopify calls in intake files
- `.github/workflows/intake-guardrails.yml` - run checks on every PR
- Verification scripts for manual testing

## Verification Artifacts (for PR)

1. **SQL Results** - Screenshot of `sql/verify/rpc_definer_verification.sql` output
2. **Network Tab** - Browser screenshot showing only RPC call (no functions) 
3. **Database Row** - Screenshot of new row in `public.intake_items`
4. **E2E Results** - Playwright test output showing expected call counts
5. **CI Status** - GitHub Actions showing guardrail checks passing

## Expected Outcomes

✅ **100% Success Rate**: "Add to Batch" succeeds for all properly assigned users  
✅ **Security**: No direct table access; all writes through authoritative RPC  
✅ **Isolation**: Users see only their items + assigned location items  
✅ **Admin Visibility**: Admins see everything across all stores/locations  
✅ **Shopify Separation**: Intake remains DB-only; sync happens on inventory operations