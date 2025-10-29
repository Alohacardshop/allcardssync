# Build Scripts

## Intake Guardrails

### `check-intake-no-shopify.sh`

CI guardrail script that prevents accidental Shopify function calls in intake modules.

**Purpose**: Ensure intake flow remains DB-only by blocking any Shopify function invocations in intake-related files.

**Usage**:
```bash
# Run the check
./scripts/check-intake-no-shopify.sh

# Make executable if needed
chmod +x scripts/check-intake-no-shopify.sh
```

**What it checks**:
- Files matching: `src/**/*intake*`, `src/**/*Intake*`, etc.
- Patterns like: `functions.invoke(.*shopify`, `supabase.functions.invoke(.*shopify`

**Integration**:
- Runs automatically in GitHub Actions CI
- Should be added to package.json scripts when possible:
  ```json
  {
    "scripts": {
      "check:intake-no-shopify": "bash scripts/check-intake-no-shopify.sh"
    }
  }
  ```

**Policy Enforced**:
- ✅ **Allowed**: RPC calls (`supabase.rpc(...)`)
- ❌ **Prohibited**: Function calls (`supabase.functions.invoke(...shopify...)`)

**Why**: Intake should be DB-only. Shopify sync happens later when moving batch → inventory.

---

## Database Maintenance Scripts

> **Last Updated**: 2025-10-29  
> **Author**: Dorian Takahashi  
> **Context**: Fixes for PostgreSQL trigger cache issues after adding `updated_by` column to `intake_items`

### Overview

These scripts resolve common PostgreSQL/PostgREST caching issues that occur after schema changes, particularly when adding columns to tables with trigger functions.

**The Problem**: When you add a column (like `updated_by`) to a table that has trigger functions referencing `NEW` or `OLD` records, PostgreSQL may cache the old row type definition. This causes errors like:
```
record "new" has no field "updated_by"
```

**The Solution**: Recompile trigger functions, recreate RPCs, and clear prepared statement cache.

---

### `db-fix-intake-items.sh`

**Purpose**: Comprehensive fix script that applies all necessary database changes to resolve the `updated_by` column issue.

**What it does**:
1. Recompiles all 10 trigger functions attached to `intake_items` with current schema
2. Recreates the `send_intake_items_to_inventory` RPC function with updated signature
3. Clears PostgreSQL prepared statement cache (resolves PostgREST stale plan issues)
4. Ensures the `updated_by` audit trigger is properly configured

**Usage for Supabase**:
```bash
# Run the script (it will detect Supabase automatically)
./scripts/db-fix-intake-items.sh

# Then follow the instructions to run these files in SQL Editor IN ORDER:
# MAIN TRANSACTION (Sections 1-3): Run in one SQL Editor tab
# 1. db/fixes/recompile_intake_items_triggers.sql
# 2. db/fixes/recreate_send_intake_items_to_inventory.sql
# 3. db/fixes/ensure_updated_by_trigger.sql

# SEPARATE SESSION (Section 4): Open NEW SQL Editor tab and run
# 4. scripts/db-discard-all.sql (⚠️ MUST run separately - cannot be in transaction)
```

**Usage for Local PostgreSQL**:
```bash
# Make executable (first time only)
chmod +x scripts/db-fix-intake-items.sh

# Run all fixes automatically
./scripts/db-fix-intake-items.sh
```

**SQL Files Included**:
- `db/fixes/recompile_intake_items_triggers.sql` - Recompiles all 10 trigger functions on intake_items
- `db/fixes/recreate_send_intake_items_to_inventory.sql` - Recreates the RPC with `updated_by` field
- `db/fixes/ensure_updated_by_trigger.sql` - Idempotently creates/updates the audit trigger
- `scripts/db-discard-all.sql` - Clears prepared statement cache (⚠️ run separately)

**When to use**:
- ⚠️ After adding/removing columns to tables with triggers
- ⚠️ When seeing `"has no field"` errors in RPC calls or triggers
- ⚠️ After schema changes affecting trigger `NEW`/`OLD` records
- ⚠️ When "Send to Inventory" operation fails with database errors
- ✅ After running `db/migrations/2025-10-29_add_updated_by_to_intake_items.sql`

---

### `db-test-updated-by.sh`

**Purpose**: End-to-end test to confirm the `intake_items_audit_updated_by` trigger is working correctly.

**What it does**:
1. Selects a test item from `intake_items` table (random or specified by UUID)
2. Updates the item to trigger the `updated_by` column
3. Verifies `updated_by` was automatically populated
4. Displays the 5 most recent items with their `updated_by` values
5. Reports success or failure with clear diagnostics

**Usage for Supabase**:
```bash
# Run the script (it will provide SQL Editor instructions)
./scripts/db-test-updated-by.sh

# Or with a specific item ID
./scripts/db-test-updated-by.sh 12345678-1234-1234-1234-123456789abc

# Then copy/paste the appropriate SQL file:
# - db/tests/test_updated_by_fix.sql (random item)
# - db/tests/test_updated_by_with_id.sql (specific item)
```

**Usage for Local PostgreSQL**:
```bash
# Make executable (first time only)
chmod +x scripts/db-test-updated-by.sh

# Test with random item
./scripts/db-test-updated-by.sh

# Test with specific item
./scripts/db-test-updated-by.sh <item_uuid>
```

**SQL Files Included**:
- `db/tests/test_updated_by_fix.sql` - Tests with a random item from the database
- `db/tests/test_updated_by_with_id.sql` - Tests with a specific item (replace placeholder ID)

**Success criteria**:
- ✅ `updated_by` is populated with the current user's UUID
- ✅ `updated_at` is set to current timestamp
- ✅ No errors thrown during update
- ✅ Test exits cleanly even if no rows exist

**On failure, the test provides**:
- Clear error messages indicating what went wrong
- List of required fix scripts to run
- Verification queries to check trigger status

---

### `db-discard-all.sql`

**Purpose**: Minimal SQL script to clear PostgREST prepared statement cache and force schema reparse.

**⚠️ CRITICAL: Must run in a SEPARATE session**
- `DISCARD ALL` cannot run inside a transaction with other SQL statements
- Must be executed in its own SQL Editor tab/session
- Run this AFTER completing Sections 1-3 of the main fix script

**What it does**:
- Executes `DISCARD ALL` to clear all prepared statements in the current connection
- Resets temporary tables and session-level variables
- Forces PostgreSQL to recompile queries with the current schema on next execution

**Usage for Supabase**:
```bash
# 1. First complete the main fix script (Sections 1-3)
# 2. Then open a NEW SQL Editor tab:
#    https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new
# 3. Copy and paste: scripts/db-discard-all.sql
# 4. Click "Run" button
```

**Usage for Local PostgreSQL**:
```bash
psql -f scripts/db-discard-all.sql
```

**When to use**:
- ⚠️ After adding or removing columns from tables
- ⚠️ After modifying trigger functions (especially those using NEW/OLD)
- ⚠️ After schema migrations that affect row types
- ⚠️ When seeing `"record has no field"` errors
- ⚠️ When RPC calls fail with schema-related errors
- ✅ After running any of the `db/fixes/` SQL files

**Limitations**:
- **Only affects the CURRENT database connection**
- Other connections in PostgREST pool still have stale cache
- For production Supabase, may need to wait for connection pool recycling
- Cannot restart PostgREST directly (managed by Supabase)

**Safe**: No data is modified - this only clears query cache.

---

## Supabase SQL Editor Instructions

All SQL scripts in this project are designed to work in the Supabase SQL Editor without modification.

**How to run SQL in Supabase**:

1. **Open SQL Editor**:
   ```
   https://supabase.com/dashboard/project/dmpoandoydaqxhzdjnmk/sql/new
   ```

2. **Copy the SQL file contents**:
   - Open the `.sql` file in this repository
   - Copy all contents (Ctrl+A, Ctrl+C)

3. **Paste into SQL Editor**:
   - Paste into the SQL Editor panel
   - Review the SQL (all scripts include comments)

4. **Run the query**:
   - Click the green "Run" button
   - Watch for NOTICE messages in the results panel
   - Check for success messages (✅) or errors (❌)

5. **Run multiple files in order**:
   - For `db-fix-intake-items.sh`, run Sections 1-3 together in one SQL Editor tab
   - Then open a NEW tab and run `scripts/db-discard-all.sql` separately
   - Each file includes verification checks
   - **Important**: `DISCARD ALL` cannot run inside a transaction

**Tips**:
- Scripts include `DO $$ BEGIN ... END $$` blocks with RAISE NOTICE for progress tracking
- Look for ✅ success or ❌ failure indicators in the output
- If a script fails, read the error message - it usually includes next steps
- After running all fixes, hard refresh your browser (Ctrl+Shift+R)

---

## Troubleshooting

### "record 'new' has no field 'updated_by'" Error

**Symptom**: RPC calls or triggers fail with:
```
record "new" has no field "updated_by"
ERROR: record "old" has no field "updated_by"
```

**Root Cause**: PostgreSQL has cached the old row type definition before the `updated_by` column was added. Trigger functions still reference the old schema.

**Solution**:

1. **Run the comprehensive fix**:
   ```bash
   ./scripts/db-fix-intake-items.sh
   ```
   Follow the instructions to run all 4 SQL files in Supabase SQL Editor.

2. **If still seeing errors after fix**:
   - **Recreate trigger functions again**: Run `db/fixes/recompile_intake_items_triggers.sql` a second time
   - **Clear cache again**: Run `db/fixes/discard_all.sql` in a new SQL Editor tab
   - **Wait for connection pool recycling**: Supabase PostgREST connections may need 5-10 minutes to recycle
   - **Hard refresh browser**: Clear client-side cache with Ctrl+Shift+R

3. **Verify the fix worked**:
   ```bash
   ./scripts/db-test-updated-by.sh
   ```
   This will confirm the `updated_by` column is accessible and working.

4. **Nuclear option - Restart PostgREST** (if you have access):
   - In Supabase dashboard: Project Settings → Database → Connection Pooler → Restart
   - This forces all connections to reconnect with fresh schema cache
   - **Note**: Only available for project owners/admins

### Other Common Issues

**"Item not found or already processed"**:
- The item has already been sent to inventory (`removed_from_batch_at` is set)
- This is not an error - the item was already processed
- Check the item's status in the database

**"No items found in intake_items table"**:
- The test script couldn't find any eligible items
- Create some test intake items first
- Or specify a known item UUID as argument

**"Trigger does not exist"**:
- The migration hasn't been run yet
- Run: `db/migrations/2025-10-29_add_updated_by_to_intake_items.sql`
- Then run the fix script

**SQL Editor shows "permission denied"**:
- Ensure you're logged in as admin/owner
- These functions use SECURITY DEFINER which requires elevated privileges
- Check your role assignments in Supabase dashboard

### Prevention

To avoid these issues in the future:

1. **After ANY column addition to trigger-enabled tables**:
   - Run `DISCARD ALL` immediately
   - Recreate all trigger functions with `CREATE OR REPLACE`
   - Test with a sample update before deploying to users

2. **Document schema changes**:
   - Update `docs/schema-changelog.md`
   - Note which triggers are affected
   - Include fix instructions

3. **Use the migration pattern**:
   - Add column with migration
   - Recreate triggers in same migration
   - Include `DISCARD ALL` at the end
   - Test before committing

---

## Related Documentation

- **Cache Issues**: See `docs/supabase-cache-notes.md` for PostgREST cache troubleshooting
- **Error Handling**: See `docs/error-handling-improvements.md` for frontend retry logic
- **Schema Changes**: See `docs/schema-changelog.md` for migration history