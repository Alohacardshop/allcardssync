# Database Schema Changelog

This document tracks all schema changes to the database, providing a historical record of migrations and their purposes.

---

## 2025-10-29: Add `updated_by` Tracking to `intake_items`

**Migration File**: `db/migrations/2025-10-29_add_updated_by_to_intake_items.sql`

**Purpose**: Track which user made the last update to each intake item for better audit trails and debugging.

**Changes**:
- Added `updated_by` column (text) to `public.intake_items` table
- Created index `idx_intake_items_updated_by` for query performance
- Column is automatically populated by `intake_items_audit_updated_by` trigger

**Related Fixes**:
- Resolved PostgREST prepared statement cache issues when calling `send_intake_items_to_inventory` RPC
- Added defensive trigger to always populate `updated_at` and `updated_by` fields
- See `docs/supabase-cache-notes.md` for cache invalidation procedures
- See `docs/error-handling-improvements.md` for frontend retry logic

**Breaking Changes**: None (column is nullable, trigger handles population)

**Migration Safety**: 
- ✅ Idempotent (safe to run multiple times)
- ✅ Non-blocking (uses `IF NOT EXISTS` clauses)
- ✅ Includes verification check for required trigger

---

## Migration Guidelines

### Creating New Migrations

1. **Naming Convention**: `YYYY-MM-DD_descriptive_name.sql`
2. **Always Use**:
   - `IF NOT EXISTS` for new objects
   - `IF EXISTS` for drops
   - Comments to document purpose
3. **Test Locally**: Run migration twice to verify idempotency
4. **Document**: Add entry to this changelog before merging

### Applying Migrations

**Supabase Projects**:
```bash
# Apply via SQL Editor in Supabase Dashboard
# Or use Supabase CLI:
supabase db push
```

**Local Development**:
```bash
# Run migration file
psql -d your_database -f db/migrations/YYYY-MM-DD_migration_name.sql
```

### PostgREST Cache Invalidation

After schema changes that modify trigger behavior or column types:

1. Run `DISCARD ALL;` via SQL Editor
2. Or restart PostgREST: `supabase stop && supabase start`
3. See `docs/supabase-cache-notes.md` for details

---

## Previous Migrations

This is the first entry in the schema changelog. Historical migrations exist in `supabase/migrations/` but are tracked by Supabase's migration system.

For Supabase-managed migrations, use:
```bash
supabase migration list
```

---

## Notes

- Always test migrations in a staging environment before production
- Keep migrations small and focused on a single logical change
- When modifying triggers that reference `NEW` or `OLD`, plan to invalidate PostgREST cache
- Document any required post-migration steps (e.g., data backfills)
