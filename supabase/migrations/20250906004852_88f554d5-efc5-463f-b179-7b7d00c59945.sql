-- Create diagnostic function to verify intake access control
CREATE OR REPLACE FUNCTION public.debug_eval_intake_access(
  _user_id uuid,
  _store_key text,
  _location_gid text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(
    'user_id', _user_id,
    'store_key', _store_key,
    'location_gid', _location_gid,
    'has_staff', (
      has_role(_user_id, 'staff'::app_role) OR 
      has_role(_user_id, 'admin'::app_role)
    ),
    'can_access_location', (
      _store_key IS NULL OR
      user_can_access_store_location(
        _user_id      := _user_id,
        _store_key    := _store_key,
        _location_gid := _location_gid
      )
    )
  );
END;
$$;