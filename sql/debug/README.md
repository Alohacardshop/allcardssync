# SQL Debug Scripts

## `rls_intake_validate.sql`

**Purpose**: Manual smoke test to verify intake access control and RLS policies.

**Usage**:
1. Open Supabase SQL Editor
2. Make sure you're logged in as a staff user
3. Run the entire script: `\i sql/debug/rls_intake_validate.sql`

**What it tests**:
- ✅ `user_can_access_store_location()` function
- ✅ `debug_eval_intake_access()` diagnostic function  
- ✅ RLS INSERT policy (with safe rollback)
- ✅ RLS SELECT policy
- ✅ Current user roles and assignments

**Expected Results**:
- Access functions return `TRUE`
- Diagnostic shows `has_staff=true, can_access_location=true`
- Dummy insert succeeds and rolls back cleanly
- User info shows proper roles and store assignments

**Troubleshooting**:
- If access denied: Check user roles in `user_roles` table
- If location access fails: Check `user_shopify_assignments` table
- If RLS blocks: Verify store_key and location_gid values are correct

**Safety**: Script uses transactions with ROLLBACK - no permanent data changes.