-- ================================================
-- FIX CRITICAL SECURITY ISSUES IN RLS POLICIES
-- ================================================

-- 1. DROP THE OVERLY PERMISSIVE POLICIES CREATED IN PREVIOUS MIGRATION
DROP POLICY IF EXISTS "Staff can view all intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Staff can insert intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Staff can update intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Staff can view all intake_lots" ON public.intake_lots;
DROP POLICY IF EXISTS "Staff can insert intake_lots" ON public.intake_lots;
DROP POLICY IF EXISTS "Staff can update intake_lots" ON public.intake_lots;

-- 2. CREATE SECURE POLICIES FOR intake_items WITH STORE/LOCATION VALIDATION

CREATE POLICY "Staff can view assigned store items"
  ON public.intake_items
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      (store_key IS NULL OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
    )
  );

CREATE POLICY "Staff can insert to assigned stores"
  ON public.intake_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );

CREATE POLICY "Staff can update assigned store items"
  ON public.intake_items
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      (store_key IS NULL OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );

CREATE POLICY "Staff can delete assigned store items"
  ON public.intake_items
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      (store_key IS NULL OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
    )
  );

-- 3. CREATE SECURE POLICIES FOR intake_lots WITH STORE/LOCATION VALIDATION

CREATE POLICY "Staff can view assigned store lots"
  ON public.intake_lots
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      (store_key IS NULL OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
    )
  );

CREATE POLICY "Staff can insert lots for assigned stores"
  ON public.intake_lots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND created_by = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role) OR
      user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );

CREATE POLICY "Staff can update assigned store lots"
  ON public.intake_lots
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      created_by = auth.uid() AND
      (store_key IS NULL OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
    )
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    (
      has_role(auth.uid(), 'staff'::app_role) AND
      created_by = auth.uid() AND
      user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );

-- 4. Log the security fix
INSERT INTO public.system_logs (level, message, context)
VALUES (
  'info',
  'Migration: Fixed critical security issues in RLS policies with proper store/location validation',
  jsonb_build_object(
    'migration', 'fix_critical_rls_security',
    'timestamp', now(),
    'fixes', jsonb_build_array(
      'Added store/location validation to all intake_items policies',
      'Added store/location validation to all intake_lots policies',
      'Added missing DELETE policy for intake_items',
      'Prevented staff from accessing items/lots outside their assigned stores'
    )
  )
);