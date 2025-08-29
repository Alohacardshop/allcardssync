-- Fix security warnings for sync_v3 functions
ALTER FUNCTION sync_v3.update_job_progress(UUID, INTEGER, INTEGER) SET search_path TO 'sync_v3', 'public';
ALTER FUNCTION sync_v3.complete_job(UUID, sync_v3.job_status, JSONB, JSONB, TEXT) SET search_path TO 'sync_v3', 'public';  
ALTER FUNCTION sync_v3.start_job(UUID) SET search_path TO 'sync_v3', 'public';
ALTER FUNCTION sync_v3.update_updated_at() SET search_path TO 'sync_v3', 'public';