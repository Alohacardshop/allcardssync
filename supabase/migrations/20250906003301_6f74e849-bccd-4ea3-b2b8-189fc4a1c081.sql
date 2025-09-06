-- Update RLS to be whitespace-tolerant for intake_items INSERT
BEGIN;

-- Replace existing policy to normalize inputs before access check
DROP POLICY IF EXISTS "Staff can insert intake_items to accessible locations" ON public.intake_items;

CREATE POLICY "Staff can insert intake_items to accessible locations"
ON public.intake_items
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'staff'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL
    OR public.user_can_access_store_location(
      _user_id => auth.uid(),
      _store_key => public._norm_gid(store_key),
      _location_gid => public._norm_gid(shopify_location_gid)
    )
  )
);

COMMIT;