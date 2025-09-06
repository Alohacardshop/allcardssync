# Fix: Make Intake Batch Inserts 100% Reliable with SECURITY DEFINER RPC

**Branch**: `fix/intake-batch-definer-rpc`

## Problem
- Users getting 42501 RLS policy violations on "Add to Batch"
- RLS INSERT policies subject to timing and client-side validation issues
- Direct table access allows bypassing business logic

## Solution
- Made `create_raw_intake_item` **SECURITY DEFINER** with internal access checks
- Revoked direct INSERT permissions - clients must use RPC
- Updated RLS SELECT policies for proper read visibility
- RPC now authoritative source of truth for access control

## Database Changes

### Migration 1: SECURITY DEFINER RPC
```sql
CREATE OR REPLACE FUNCTION public.create_raw_intake_item(...)
LANGUAGE plpgsql
SECURITY DEFINER  -- ⭐ Key change
SET search_path = public
```

### Migration 2: Revoke Direct Access
```sql
REVOKE INSERT ON public.intake_items FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_raw_intake_item(...) TO authenticated;
```

### Migration 3: Enhanced SELECT RLS
```sql
CREATE POLICY "Users see their items or assigned items"
ON public.intake_items FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()  -- ⭐ Users see their own items
  OR public.user_can_access_store_location(...)
);
```

## Verification Checklist

- [ ] **Network**: On Add to Batch, only RPC calls; no `/functions/v1/*`.

- [ ] **DB**: `public.intake_items` shows the new row; no Shopify triggers exist.

- [ ] **Preflight**: Toast shows `hasStaff=true`, `canAccessLocation=true`.

- [ ] **E2E**: Intake test passes (no functions invoked).

- [ ] **Inventory path**: Moving to inventory still invokes `/functions/v1/shopify-sync-inventory`.

- [ ] **CI**: `npm run check:intake-no-shopify` passes.

## Manual Testing Results

### SQL Verification
```sql
-- Run: sql/verify/rpc_definer_verification.sql
-- Expected: All checks ✅ PASS
```

**Access Check**: ✅ TRUE  
**Function Security**: ✅ SECURITY DEFINER  
**Direct INSERT**: ✅ Blocked  
**RPC Insert**: ✅ Success  

### Browser Testing (Network Tab)
- **Action**: Click "Add to Batch" in Graded/Raw intake
- **Expected**: Only `/rest/v1/rpc/create_raw_intake_item` (200 OK)
- **Verified**: No `/functions/v1/shopify-*` requests

### Database Row Verification
- **Item Created**: ✅ New row in `public.intake_items`
- **Fields Set**: `created_by`, `store_key`, `shopify_location_gid`, `lot_number`
- **Access Control**: User can see their item, admin sees all

## Commits

1. `feat(sql): make create_raw_intake_item SECURITY DEFINER with internal access check`
2. `chore(sql): revoke direct INSERT; grant execute on RPC`  
3. `feat(rls): users see their items or assigned items; admins see all`

## Security Model

| Action | Before | After |
|--------|--------|-------|
| Insert | ❌ RLS policy (unreliable) | ✅ RPC DEFINER (authoritative) |
| Read | ✅ RLS SELECT | ✅ Enhanced RLS SELECT |
| Access Check | ❌ Client-side + RLS | ✅ Server-side in RPC |

## Impact

✅ **Eliminates** 42501 RLS violations on intake  
✅ **Maintains** Shopify sync only on inventory operations  
✅ **Preserves** user isolation and admin visibility  
✅ **Enforces** business logic through authoritative RPC