-- Phase 1: Database Optimization for faster admin access verification

-- 1. Add composite index for instant role lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role 
ON public.user_roles(user_id, role);

-- 2. Optimize verify_user_access function to use single query instead of 3
CREATE OR REPLACE FUNCTION public.verify_user_access(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_roles_array app_role[];
  has_staff boolean;
  has_admin boolean;
BEGIN
  -- Single query to get all roles at once (was 3 separate queries)
  SELECT array_agg(role) INTO user_roles_array
  FROM public.user_roles
  WHERE user_id = _user_id;
  
  -- Check role membership in memory
  has_staff := 'staff' = ANY(COALESCE(user_roles_array, ARRAY[]::app_role[]));
  has_admin := 'admin' = ANY(COALESCE(user_roles_array, ARRAY[]::app_role[]));
  
  RETURN jsonb_build_object(
    'user_id', _user_id,
    'authenticated', _user_id IS NOT NULL,
    'has_staff_access', has_staff,
    'has_admin_access', has_admin,
    'access_granted', has_staff OR has_admin
  );
END;
$$;