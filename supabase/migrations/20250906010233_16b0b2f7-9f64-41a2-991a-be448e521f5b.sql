-- Clients must use the RPC; no direct table inserts
REVOKE INSERT ON public.intake_items FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_raw_intake_item(
  text, text, integer, text, text, text, text, text, text, numeric, numeric, text, text, jsonb, jsonb, text
) TO authenticated;

-- Optional: drop legacy INSERT policy if present (RPC now enforces access)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='intake_items'
      AND policyname ILIKE '%insert%'
  ) THEN
    -- Replace with the exact policy name you used previously if needed:
    DROP POLICY IF EXISTS "Staff can insert intake_items to accessible locations" ON public.intake_items;
    DROP POLICY IF EXISTS "Users can insert intake_items to accessible locations" ON public.intake_items;
  END IF;
END $$;

-- Update RLS for reads: users see "their current batch" + admins see all
DROP POLICY IF EXISTS "Users can view intake_items they have access to" ON public.intake_items;
DROP POLICY IF EXISTS "Users see intake items (assignment)" ON public.intake_items;

CREATE POLICY "Users see their items or assigned items"
ON public.intake_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR created_by = auth.uid()
  OR public.user_can_access_store_location(
       _user_id      := auth.uid(),
       _store_key    := store_key,
       _location_gid := shopify_location_gid
     )
);