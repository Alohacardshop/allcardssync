# Supabase Cache & Prepared Statement Management

## Overview

Supabase/PostgREST uses **prepared statements** and **connection pooling**, which cache compiled SQL plans and row-type definitions. When you modify table schemas (add/remove columns) or recreate functions, these cached plans can become stale.

## Common Symptom

```
ERROR: record "new" has no field "updated_by"
```

This error occurs when:
1. You add a new column to a table (e.g., `updated_by` to `intake_items`)
2. A trigger function references that column
3. The trigger function was compiled **before** the column existed
4. PostgreSQL's cached plan still uses the old row type

## Why This Happens

### PostgreSQL Plan Caching
- **Trigger functions** compile with a snapshot of the table's row type (`NEW`/`OLD`)
- When you `CREATE OR REPLACE FUNCTION`, it recompiles and updates the snapshot
- **BUT** if you add a column without recreating dependent functions, they retain old row types

### PostgREST Connection Pooling
- PostgREST maintains a pool of database connections
- Each connection may have **prepared statements** that reference old schema
- These prepared statements persist until the connection is closed or explicitly discarded

### Supabase Edge Functions
- Edge functions use their own connection pools
- May cache function definitions and prepared statements
- Requires explicit cache invalidation or redeployment

## Solutions (In Order of Preference)

### 1. Recreate ALL Dependent Functions (Best Practice)

When you add a column referenced in triggers, **always recreate** all trigger functions:

```sql
-- After adding column
ALTER TABLE public.intake_items ADD COLUMN updated_by text;

-- Force recompilation of ALL triggers on that table
CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot() ...;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() ...;
-- ... recreate all other trigger functions
```

**Why this works**: Forces PostgreSQL to re-parse the row type with new columns.

### 2. Discard Prepared Statements

If recreating functions doesn't work (due to connection pooling), clear cached plans:

```sql
DISCARD ALL;
```

**What it does**:
- Clears all prepared statements in the current session
- Resets temporary tables, sequences, and session variables
- Forces next query to recompile with current schema

**When to use**:
- After schema migrations that add/remove columns
- After recreating functions that reference `NEW`/`OLD`
- When you see "record has no field" errors despite recreating functions

**Limitations**:
- Only affects the **current connection**
- Other pooled connections still have stale cache
- Need to run on each connection or restart the pool

### 3. Restart PostgREST / Connection Pool

For production systems with persistent connection pools:

**Supabase Hosted**:
- Contact Supabase support to restart PostgREST
- Or wait ~15 minutes for connections to naturally cycle

**Self-hosted**:
```bash
# Restart PostgREST service
systemctl restart postgrest

# Or restart PostgreSQL connection pooler
systemctl restart pgbouncer
```

### 4. Hard Refresh Client Applications

Browser and client applications may cache:
- API response schemas
- Type definitions (if using TypeScript)
- Supabase client connections

**Always advise users to**:
- Hard refresh browser: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
- Clear application cache
- Restart development servers

## Prevention Checklist

When making schema changes that affect triggers:

- [ ] Add the new column with migration
- [ ] Create index if needed
- [ ] **Immediately** recreate all trigger functions that reference `NEW`/`OLD`
- [ ] Recreate any RPC functions that UPDATE the table
- [ ] Run `DISCARD ALL;` in a SQL session to verify no cache issues
- [ ] Test the change with a direct SQL UPDATE before testing in application
- [ ] Document the change in migration comments
- [ ] Advise users to hard refresh

## Testing After Schema Changes

```sql
-- Test that the new column is recognized
UPDATE public.intake_items 
SET updated_by = auth.uid()::text
WHERE id = '<some-test-id>';

-- Should succeed without "record has no field" error
```

## Edge Cases

### Trigger Execution Order
If you have multiple `BEFORE UPDATE` triggers:
1. All run in **alphabetical order** by trigger name
2. Each sees the `NEW` row modified by previous triggers
3. Cache issues can cause inconsistent behavior

**Solution**: Consolidate related logic into fewer triggers.

### Function Dependencies
If function A calls function B, and B references a table:
- Recreating A alone may not help
- Must recreate **both** A and B

**Solution**: Map all dependencies before migrations.

### Cross-Schema References
Functions in different schemas may reference your tables:
- `audit_schema.log_changes()` → `public.intake_items`
- Must recreate audit functions too

**Solution**: Always check `pg_depend` for references.

## Quick Reference

| Problem | Solution | Command |
|---------|----------|---------|
| Added column, trigger fails | Recreate trigger functions | `CREATE OR REPLACE FUNCTION ...` |
| Still failing after recreate | Clear prepared statements | `DISCARD ALL;` |
| Production persistent issue | Restart PostgREST pool | Contact support or `systemctl restart` |
| Client shows old schema | Hard refresh browser | `Ctrl+Shift+R` |

## See Also

- [PostgreSQL DISCARD documentation](https://www.postgresql.org/docs/current/sql-discard.html)
- [PostgREST connection pooling](https://postgrest.org/en/stable/configuration.html#db-pool)
- [Supabase migrations guide](https://supabase.com/docs/guides/database/migrations)

## History

This document was created after encountering `record "new" has no field "updated_by"` error when:
1. Added `updated_by text` column to `intake_items`
2. `send_intake_items_to_inventory()` RPC failed with stale row type
3. Required recreating ALL trigger functions + the RPC function
4. Issue resolved after complete recompilation
