-- Drop sync_v3 schema and all related tables
DROP SCHEMA IF EXISTS sync_v3 CASCADE;

-- Remove sync-related columns from catalog_v2 tables
ALTER TABLE catalog_v2.sets 
DROP COLUMN IF EXISTS last_sync_at,
DROP COLUMN IF EXISTS sync_status;

ALTER TABLE catalog_v2.cards 
DROP COLUMN IF EXISTS last_sync_at,
DROP COLUMN IF EXISTS sync_status;

ALTER TABLE catalog_v2.variants 
DROP COLUMN IF EXISTS last_sync_at,
DROP COLUMN IF EXISTS sync_status;