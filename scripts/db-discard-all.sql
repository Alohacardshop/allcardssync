-- DISCARD ALL: Clear PostgREST prepared statement cache
-- 
-- Run this after:
-- - Adding or removing columns from tables
-- - Modifying trigger functions
-- - Schema migrations that affect row types
-- 
-- This forces PostgreSQL to reparse queries with the current schema.
-- Safe to run anytime - no data is modified.

DISCARD ALL;

-- Success
DO $$
BEGIN
  RAISE NOTICE '✅ Prepared statement cache cleared';
  RAISE NOTICE 'Connection will recompile queries on next execution';
END $$;
