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

### `db-fix-intake-items.sh`

Applies all database fixes for the `updated_by` column issue in the `intake_items` table.

**Purpose**: 
- Recompiles triggers to recognize new columns
- Recreates the `send_intake_items_to_inventory` RPC function
- Clears PostgreSQL prepared statement cache (resolves PostgREST stale plan issues)

**Usage**:
```bash
# Make executable (first time only)
chmod +x scripts/db-fix-intake-items.sh

# Run the fixes
./scripts/db-fix-intake-items.sh
```

**For Supabase Projects**: The script detects Supabase and provides SQL Editor instructions instead of attempting direct psql connection.

**What it runs**:
1. `db/fixes/recompile_intake_items_triggers.sql` - Recompiles all triggers on intake_items
2. `db/fixes/recreate_send_intake_items_to_inventory.sql` - Recreates the RPC with updated signature
3. `db/fixes/discard_all.sql` - Clears prepared statement cache

**When to use**:
- After adding/removing columns to tables with triggers
- When seeing "has no field" errors in RPC calls
- After any schema changes affecting trigger `NEW`/`OLD` records

---

### `db-test-updated-by.sh`

Verifies that the `updated_by` audit column is properly populated by the trigger.

**Purpose**: End-to-end test to confirm the `intake_items_audit_updated_by` trigger is working correctly.

**Usage**:
```bash
# Make executable (first time only)
chmod +x scripts/db-test-updated-by.sh

# Test with a specific item
./scripts/db-test-updated-by.sh <item_uuid>

# Test with a random item (auto-selects from DB)
./scripts/db-test-updated-by.sh
```

**What it does**:
1. Selects an item from `intake_items` table (random if no ID provided)
2. Updates the item's `processing_notes` field
3. Verifies `updated_by` was automatically set by the trigger
4. Reports success or failure with troubleshooting steps

**For Supabase Projects**: Outputs SQL you can run directly in the SQL Editor.

**Success criteria**:
- ✅ `updated_by` is populated with the current user's UUID
- ✅ `updated_at` is set to current timestamp
- ✅ No errors thrown during update

**Troubleshooting on failure**:
1. Ensure migration has been applied: `db/migrations/2025-10-29_add_updated_by_to_intake_items.sql`
2. Run fix script: `./scripts/db-fix-intake-items.sh`
3. Verify trigger: `SELECT * FROM pg_trigger WHERE tgname = 'intake_items_audit_updated_by';`

---

### `db-discard-all.sql`

Minimal SQL script to clear PostgREST prepared statement cache.

**Purpose**: Forces PostgreSQL to reparse queries with the current schema after schema modifications.

**Usage**:
```bash
# In Supabase SQL Editor
# Copy and paste: scripts/db-discard-all.sql

# Or for local PostgreSQL
psql -f scripts/db-discard-all.sql
```

**When to use**:
- ⚠️ After adding or removing columns from tables
- ⚠️ After modifying trigger functions
- ⚠️ After schema migrations that affect row types (NEW/OLD records)
- ⚠️ When seeing "record has no field" errors
- ✅ After running `db/migrations/2025-10-29_add_updated_by_to_intake_items.sql`

**What it does**:
- Clears all prepared statements in the current connection
- Resets temporary tables and session-level variables
- Forces recompilation of queries on next execution

**Limitations**:
- Only affects the CURRENT database connection
- Other connections in PostgREST pool still have stale cache
- For production, may need to restart PostgREST or wait for connection recycling

**Safe**: No data is modified - this only clears query cache.

---

## Related Documentation

- **Cache Issues**: See `docs/supabase-cache-notes.md` for PostgREST cache troubleshooting
- **Error Handling**: See `docs/error-handling-improvements.md` for frontend retry logic
- **Schema Changes**: See `docs/schema-changelog.md` for migration history