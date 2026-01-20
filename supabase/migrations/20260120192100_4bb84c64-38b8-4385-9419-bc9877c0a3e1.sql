-- Fix 1: Remove overly permissive "Public read access" policy from catalog_v2.games table
-- This allows unauthenticated users to read all game catalog data
DROP POLICY IF EXISTS "Public read access" ON catalog_v2.games;

-- Add a proper read policy for catalog_v2.games that requires authentication
CREATE POLICY "Staff and Admin can view games" 
ON catalog_v2.games 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Recreate dead_letter_failure_analysis view with SECURITY INVOKER
-- This ensures the view respects the caller's RLS policies instead of the definer's
DROP VIEW IF EXISTS public.dead_letter_failure_analysis;

CREATE VIEW public.dead_letter_failure_analysis 
WITH (security_invoker = true)
AS
SELECT 
    error_type,
    count(*) AS failure_count,
    min(created_at) AS first_failure,
    max(created_at) AS last_failure,
    count(*) FILTER (WHERE resolved_at IS NULL) AS unresolved_count
FROM shopify_dead_letter_queue
GROUP BY error_type
ORDER BY count(*) DESC;

-- Grant appropriate access to the view
GRANT SELECT ON public.dead_letter_failure_analysis TO authenticated;

-- Fix 3: Recreate stale_lot_items view with SECURITY INVOKER
DROP VIEW IF EXISTS public.stale_lot_items;

CREATE VIEW public.stale_lot_items 
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
    now() - GREATEST(created_at, updated_at) AS age
FROM intake_items ii
WHERE 
    lot_id IS NOT NULL 
    AND pushed_at IS NULL 
    AND deleted_at IS NULL 
    AND GREATEST(created_at, updated_at) < (now() - '24:00:00'::interval);

-- Grant appropriate access to the view
GRANT SELECT ON public.stale_lot_items TO authenticated;