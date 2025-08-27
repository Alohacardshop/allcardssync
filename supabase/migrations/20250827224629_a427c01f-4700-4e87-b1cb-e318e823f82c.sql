-- Reset JustTCG integration data - truncate all specified tables
-- This keeps the schema intact but removes all data

-- Truncate tables in the correct order to handle foreign key constraints
TRUNCATE TABLE catalog_v2.variants CASCADE;
TRUNCATE TABLE catalog_v2.cards CASCADE;
TRUNCATE TABLE catalog_v2.sets CASCADE;
TRUNCATE TABLE public.justtcg_analytics_snapshots CASCADE;
TRUNCATE TABLE public.justtcg_watchlist CASCADE;

-- Also truncate sync-related tables that might have JustTCG data
TRUNCATE TABLE public.sync_queue CASCADE;
TRUNCATE TABLE catalog_v2.sync_errors CASCADE;