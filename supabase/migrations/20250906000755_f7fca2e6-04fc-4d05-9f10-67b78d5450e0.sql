-- 1) Use named args to avoid positional mismatch
ALTER POLICY "Staff can insert intake_items to accessible locations"
ON public.intake_items
WITH CHECK (
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND (
    store_key IS NULL
    OR public.user_can_access_store_location(
      _location_gid := shopify_location_gid,
      _store_key    := store_key,
      _user_id      := auth.uid()
    )
  )
);

-- -- Smoke test (run manually as an authenticated staff user)
-- select public.user_can_access_store_location(
--   _location_gid := 'gid://shopify/Location/82751193319',
--   _store_key    := 'las_vegas',
--   _user_id      := auth.uid()
-- ) as should_be_true;
