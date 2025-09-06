-- Normalize/trim helper
CREATE OR REPLACE FUNCTION public._norm_gid(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(btrim(t), '');
$$;

-- Recreate function with explicit, sensible arg order
CREATE OR REPLACE FUNCTION public.user_can_access_store_location(
  _user_id uuid,
  _store_key text,
  _location_gid text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN has_role(_user_id, 'admin'::app_role) THEN true
    -- For non-admins, check if they have assignment to this store/location
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

-- Update policy to named args (future-proof)
ALTER POLICY "Staff can insert intake_items to accessible locations"
ON public.intake_items
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL
    OR public.user_can_access_store_location(
      _user_id      := auth.uid(),
      _store_key    := store_key,
      _location_gid := shopify_location_gid
    )
  )
);

-- -- Verification (run manually)
-- SELECT public.user_can_access_store_location(
--   _user_id      := auth.uid(),
--   _store_key    := 'las_vegas',
--   _location_gid := 'gid://shopify/Location/82751193319'
-- ) AS expect_true;