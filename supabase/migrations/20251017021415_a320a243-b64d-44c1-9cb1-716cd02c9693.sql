
-- ================================================
-- FIX USER PERMISSIONS FOR BATCH OPERATIONS
-- ================================================

-- 1. Ensure all users have staff role (minimum required)
-- Kenneth only has staff role, everyone else has admin+staff, so this is already good
-- But let's add a safety check for any future users

-- 2. SIMPLIFY AND FIX RLS POLICIES FOR intake_items
-- Drop all existing policies to start fresh
DROP POLICY IF EXISTS "Authenticated users can update intake_items with access" ON public.intake_items;
DROP POLICY IF EXISTS "Staff/Admin can insert intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Staff/Admin can update intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Staff/Admin can view intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Users can update intake_items they have access to" ON public.intake_items;
DROP POLICY IF EXISTS "Users see their items or assigned items" ON public.intake_items;

-- Create clean, simple policies for intake_items
CREATE POLICY "Staff can view all intake_items"
  ON public.intake_items
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can insert intake_items"
  ON public.intake_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can update intake_items"
  ON public.intake_items
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- 3. SIMPLIFY RLS POLICIES FOR intake_lots
DROP POLICY IF EXISTS "Staff can insert intake_lots to accessible locations" ON public.intake_lots;
DROP POLICY IF EXISTS "Staff can update intake_lots they have access to" ON public.intake_lots;
DROP POLICY IF EXISTS "Users can view intake_lots they have access to" ON public.intake_lots;

-- Create clean policies for intake_lots
CREATE POLICY "Staff can view all intake_lots"
  ON public.intake_lots
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'staff'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Staff can insert intake_lots"
  ON public.intake_lots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR COALESCE(created_by, auth.uid()) = auth.uid())
  );

CREATE POLICY "Staff can update intake_lots"
  ON public.intake_lots
  FOR UPDATE
  TO authenticated
  USING (
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid())
  )
  WITH CHECK (
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid())
  );

-- 4. GRANT EXECUTE PERMISSIONS ON CRITICAL FUNCTIONS
GRANT EXECUTE ON FUNCTION public.get_or_create_active_lot(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_can_access_store_location(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_intake_items_to_inventory(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_intake_item(uuid, text) TO authenticated;

-- 5. Add helpful index for better performance
CREATE INDEX IF NOT EXISTS idx_intake_items_lot_deleted ON public.intake_items(lot_id, deleted_at, removed_from_batch_at);
CREATE INDEX IF NOT EXISTS idx_intake_lots_status_store_location ON public.intake_lots(status, store_key, shopify_location_gid, created_by);

-- Log the migration
INSERT INTO public.system_logs (level, message, context)
VALUES (
  'info',
  'Migration: Simplified RLS policies and fixed user permissions for batch operations',
  jsonb_build_object(
    'migration', 'fix_user_batch_permissions',
    'timestamp', now()
  )
);
