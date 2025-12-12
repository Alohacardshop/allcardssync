-- Fix the stale_lot_items view to use SECURITY INVOKER instead of SECURITY DEFINER
-- This ensures the view respects the querying user's RLS policies instead of the view creator's

DROP VIEW IF EXISTS stale_lot_items;

CREATE VIEW stale_lot_items 
WITH (security_invoker = true)
AS
SELECT 
    id,
    lot_id,
    sku,
    psa_cert,
    created_at,
    updated_at,
    GREATEST(created_at, updated_at) AS last_modified,
    (now() - GREATEST(created_at, updated_at)) AS age
FROM intake_items ii
WHERE 
    lot_id IS NOT NULL 
    AND pushed_at IS NULL 
    AND deleted_at IS NULL 
    AND GREATEST(created_at, updated_at) < (now() - '24:00:00'::interval);