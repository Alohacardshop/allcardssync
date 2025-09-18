-- Function to set a user's default location (ensures only one default per user)
CREATE OR REPLACE FUNCTION public.set_user_default_location(
  _user_id uuid,
  _store_key text,
  _location_gid text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Require admin or staff role
  IF NOT (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'staff'::app_role)) THEN
    RAISE EXCEPTION 'Access denied: Staff or admin role required';
  END IF;
  
  -- Clear all existing defaults for this user
  UPDATE public.user_shopify_assignments 
  SET is_default = false, updated_at = now()
  WHERE user_id = _user_id;
  
  -- Set the new default location
  UPDATE public.user_shopify_assignments 
  SET is_default = true, updated_at = now()
  WHERE user_id = _user_id 
    AND store_key = _store_key 
    AND location_gid = _location_gid;
  
  -- Verify the assignment exists
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Location assignment not found for user';
  END IF;
END;
$$;

-- Clean up existing multiple defaults (keep the most recently updated one per user)
WITH latest_defaults AS (
  SELECT DISTINCT ON (user_id) 
    id, user_id
  FROM public.user_shopify_assignments 
  WHERE is_default = true
  ORDER BY user_id, updated_at DESC
),
multiple_defaults AS (
  SELECT usa.id
  FROM public.user_shopify_assignments usa
  WHERE usa.is_default = true
    AND usa.id NOT IN (SELECT id FROM latest_defaults)
)
UPDATE public.user_shopify_assignments 
SET is_default = false, updated_at = now()
WHERE id IN (SELECT id FROM multiple_defaults);