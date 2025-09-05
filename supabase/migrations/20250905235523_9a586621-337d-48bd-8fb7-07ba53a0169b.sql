-- Drop the conflicting INSERT policies on intake_items and create a single comprehensive one
DROP POLICY IF EXISTS "Authenticated users can insert intake_items with access" ON public.intake_items;
DROP POLICY IF EXISTS "Users can insert intake_items to accessible locations" ON public.intake_items;

-- Create a single comprehensive INSERT policy
CREATE POLICY "Staff can insert intake_items to accessible locations"
ON public.intake_items
FOR INSERT
TO authenticated
WITH CHECK (
  -- Must be staff or admin
  (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND 
  -- Must have access to the store/location (or no store/location specified)
  ((store_key IS NULL) OR user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
);

-- Also clean up the debug function since we don't need it anymore
DROP FUNCTION IF EXISTS debug_lot_creation_for_dorian();