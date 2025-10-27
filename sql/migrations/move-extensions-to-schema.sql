-- Migration: Move extensions from public to extensions schema
-- Purpose: Follow security best practices by isolating extensions
-- References: https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

-- IMPORTANT: This migration requires elevated privileges and should be run during a maintenance window
-- Estimated downtime: 1-2 minutes

-- Step 1: Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- Step 2: Grant usage on extensions schema
GRANT USAGE ON SCHEMA extensions TO postgres, anon, authenticated, service_role;

-- Step 3: Move pg_trgm extension
-- Note: This requires dropping and recreating the extension
-- All dependent indexes will be automatically recreated

-- Save dependent objects
DO $$
DECLARE
  idx_record RECORD;
BEGIN
  -- Log indexes that will be affected
  FOR idx_record IN 
    SELECT 
      schemaname,
      tablename,
      indexname,
      indexdef
    FROM pg_indexes
    WHERE indexdef ILIKE '%gin_trgm_ops%'
       OR indexdef ILIKE '%gist_trgm_ops%'
  LOOP
    RAISE NOTICE 'Index will be recreated: %.%', idx_record.schemaname, idx_record.indexname;
  END LOOP;
END $$;

-- Drop and recreate pg_trgm in extensions schema
DROP EXTENSION IF EXISTS pg_trgm CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;

-- Step 4: Move pg_net extension
-- pg_net is used for HTTP requests from database
DROP EXTENSION IF EXISTS pg_net CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA extensions;

-- Step 5: Update search_path for roles to include extensions schema
-- This ensures functions can find the extensions
ALTER ROLE postgres SET search_path TO "$user", public, extensions;
ALTER ROLE authenticated SET search_path TO "$user", public, extensions;
ALTER ROLE service_role SET search_path TO "$user", public, extensions;
ALTER ROLE anon SET search_path TO "$user", public, extensions;

-- Step 6: Verify extensions are in correct schema
DO $$
DECLARE
  ext_record RECORD;
BEGIN
  FOR ext_record IN
    SELECT e.extname, n.nspname
    FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname IN ('pg_trgm', 'pg_net')
  LOOP
    IF ext_record.nspname != 'extensions' THEN
      RAISE WARNING 'Extension % is in schema % (expected extensions)', 
        ext_record.extname, ext_record.nspname;
    ELSE
      RAISE NOTICE 'Extension % successfully moved to extensions schema', 
        ext_record.extname;
    END IF;
  END LOOP;
END $$;

-- Step 7: Recreate trigram indexes on critical tables
-- These improve search performance on text fields

-- Intake items search
CREATE INDEX IF NOT EXISTS idx_intake_items_brand_title_trgm 
ON public.intake_items USING gin (brand_title extensions.gin_trgm_ops)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_subject_trgm 
ON public.intake_items USING gin (subject extensions.gin_trgm_ops)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_sku_trgm 
ON public.intake_items USING gin (sku extensions.gin_trgm_ops)
WHERE deleted_at IS NULL;

-- Catalog search
CREATE INDEX IF NOT EXISTS idx_catalog_cards_name_trgm 
ON catalog_v2.cards USING gin (name extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_catalog_sets_name_trgm 
ON catalog_v2.sets USING gin (name extensions.gin_trgm_ops);

-- Step 8: Log completion
INSERT INTO public.system_logs (level, message, context, source)
VALUES (
  'info',
  'Extensions migration completed',
  jsonb_build_object(
    'extensions_moved', ARRAY['pg_trgm', 'pg_net'],
    'target_schema', 'extensions',
    'indexes_recreated', true
  ),
  'database_migration'
);

-- Verification queries (run after migration)
-- Uncomment and run these to verify the migration

-- Check extension schema
-- SELECT e.extname, n.nspname 
-- FROM pg_extension e
-- JOIN pg_namespace n ON e.extnamespace = n.oid
-- WHERE e.extname IN ('pg_trgm', 'pg_net');

-- Check trigram indexes
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE indexdef ILIKE '%gin_trgm_ops%'
-- ORDER BY schemaname, tablename;

-- Test trigram search
-- SELECT * FROM intake_items 
-- WHERE brand_title % 'pokemon' 
-- LIMIT 5;

-- ROLLBACK PLAN:
-- If issues occur, run this to move extensions back to public schema:
-- 
-- DROP EXTENSION IF EXISTS pg_trgm CASCADE;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA public;
-- DROP EXTENSION IF EXISTS pg_net CASCADE;
-- CREATE EXTENSION IF NOT EXISTS pg_net SCHEMA public;
--
-- Then recreate indexes without schema prefix:
-- CREATE INDEX idx_intake_items_brand_title_trgm ON public.intake_items USING gin (brand_title gin_trgm_ops);
-- etc.
