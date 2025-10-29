-- DISCARD ALL: Clear PostgREST prepared statement cache
-- 
-- ⚠️ IMPORTANT: This must be run in a SEPARATE SQL Editor tab/session
-- ⚠️ Cannot run inside a transaction with other statements
-- 
-- Run this after:
-- - Adding or removing columns from tables
-- - Modifying trigger functions
-- - Schema migrations that affect row types
-- - Running the main fix script (Sections 1-3)
-- 
-- This forces PostgreSQL to reparse queries with the current schema.
-- Safe to run anytime - no data is modified.

DISCARD ALL;
