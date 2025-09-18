-- Fix search_path for the new functions to resolve security warnings

-- Fix debug_user_auth function
CREATE OR REPLACE FUNCTION public.debug_user_auth(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb := '{}';
BEGIN
  -- Check if user exists
  result := jsonb_build_object(
    'user_id', _user_id,
    'user_exists', EXISTS(SELECT 1 FROM auth.users WHERE id = _user_id),
    'roles', COALESCE(
      (SELECT jsonb_agg(role) FROM user_roles WHERE user_id = _user_id), 
      '[]'::jsonb
    ),
    'has_staff_role', has_role(_user_id, 'staff'::app_role),
    'has_admin_role', has_role(_user_id, 'admin'::app_role)
  );
  
  RETURN result;
END;
$$;

-- Fix cleanup_user_session function
CREATE OR REPLACE FUNCTION public.cleanup_user_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function can be called from client to help with session cleanup
  -- No action needed on database side, but provides a safe endpoint
  NULL;
END;
$$;

-- Fix bootstrap_user_admin function
CREATE OR REPLACE FUNCTION public.bootstrap_user_admin(_target_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_count integer;
  result jsonb;
BEGIN
  -- Count existing admins
  SELECT COUNT(*) INTO admin_count
  FROM user_roles
  WHERE role = 'admin'::app_role;
  
  -- Allow bootstrapping if no admin exists OR if user is already admin
  IF admin_count = 0 OR has_role(_target_user_id, 'admin'::app_role) THEN
    -- Grant both admin and staff roles
    INSERT INTO user_roles (user_id, role)
    VALUES 
      (_target_user_id, 'admin'::app_role),
      (_target_user_id, 'staff'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
    
    result := jsonb_build_object(
      'success', true,
      'message', 'Admin role granted',
      'user_id', _target_user_id
    );
  ELSE
    result := jsonb_build_object(
      'success', false,
      'message', 'Bootstrap denied - admin already exists',
      'admin_count', admin_count
    );
  END IF;
  
  RETURN result;
END;
$$;

-- Fix verify_user_access function
CREATE OR REPLACE FUNCTION public.verify_user_access(_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  result := jsonb_build_object(
    'user_id', _user_id,
    'authenticated', _user_id IS NOT NULL,
    'has_staff_access', has_role(_user_id, 'staff'::app_role),
    'has_admin_access', has_role(_user_id, 'admin'::app_role),
    'access_granted', has_role(_user_id, 'staff'::app_role) OR has_role(_user_id, 'admin'::app_role)
  );
  
  RETURN result;
END;
$$;