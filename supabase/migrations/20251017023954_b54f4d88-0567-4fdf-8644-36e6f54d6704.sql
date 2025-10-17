-- ================================================
-- PHASE 1: FIX CRITICAL SECURITY ISSUES
-- Add search_path to SECURITY DEFINER functions
-- ================================================

-- Fix has_role function (used in RLS policies)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Fix user_can_access_store_location function (used in RLS policies)
CREATE OR REPLACE FUNCTION public.user_can_access_store_location(_user_id uuid, _store_key text, _location_gid text DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN has_role(_user_id, 'admin'::app_role) THEN true
    WHEN _location_gid IS NULL THEN EXISTS (
      SELECT 1 FROM user_shopify_assignments usa
      WHERE usa.user_id = _user_id AND usa.store_key = _store_key
    )
    ELSE EXISTS (
      SELECT 1 FROM user_shopify_assignments usa  
      WHERE usa.user_id = _user_id 
        AND usa.store_key = _store_key 
        AND (
          usa.location_gid IS NULL
          OR public._norm_gid(usa.location_gid) = public._norm_gid(_location_gid)
        )
    )
  END;
$$;

-- Fix is_inventory_sync_enabled function
CREATE OR REPLACE FUNCTION public.is_inventory_sync_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT key_value FROM system_settings WHERE key_name = 'INVENTORY_SYNC_MODE'),
    'auto'
  ) = 'auto';
$$;

-- Fix can_delete_batch_item function
CREATE OR REPLACE FUNCTION public.can_delete_batch_item(_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.intake_items i
    JOIN public.intake_lots l ON l.id = i.lot_id
    WHERE i.id = _item_id
      AND i.removed_from_batch_at IS NULL
      AND l.status = 'active'
      AND l.created_by = auth.uid()
  );
$$;

-- Log the security fix
INSERT INTO public.system_logs (level, message, context)
VALUES (
  'info',
  'Migration: Fixed search_path security issues in SECURITY DEFINER functions',
  jsonb_build_object(
    'migration', 'fix_search_path_security',
    'timestamp', now(),
    'functions_fixed', jsonb_build_array(
      'has_role',
      'user_can_access_store_location',
      'is_inventory_sync_enabled',
      'can_delete_batch_item'
    ),
    'description', 'Added SET search_path = public to all SECURITY DEFINER functions to prevent search_path injection attacks'
  )
);