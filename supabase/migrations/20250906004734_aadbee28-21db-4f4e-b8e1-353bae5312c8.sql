-- Update INSERT policy to use named arguments for user_can_access_store_location
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