
-- Allow authenticated users to insert intake_items they have access to
-- (keeps existing staff/admin policies in place)
CREATE POLICY "Authenticated users can insert intake_items with access"
  ON public.intake_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      store_key IS NULL
      OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );

-- Allow authenticated users to update intake_items they have access to
CREATE POLICY "Authenticated users can update intake_items with access"
  ON public.intake_items
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (
      store_key IS NULL
      OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      store_key IS NULL
      OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
    )
  );
