-- Clients must use the RPC; no direct table inserts
REVOKE INSERT ON public.intake_items FROM authenticated;

-- Grant execute permissions on the RPC function
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
    -- Drop existing INSERT policies since we're using RPC-enforced access now
    DROP POLICY IF EXISTS "Staff can insert intake_items to accessible locations" ON public.intake_items;
    DROP POLICY IF EXISTS "Users can insert intake_items to accessible locations" ON public.intake_items;
  END IF;
END $$;