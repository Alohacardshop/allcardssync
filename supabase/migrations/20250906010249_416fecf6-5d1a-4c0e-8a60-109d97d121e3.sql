-- Update RLS for read visibility: users see "their current batch" + admins see all
DROP POLICY IF EXISTS "Users can view their own intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Users can view intake_items they have access to" ON public.intake_items;
DROP POLICY IF EXISTS "Staff/Admin can view intake_items" ON public.intake_items;
DROP POLICY IF EXISTS "Users see intake items (assignment)" ON public.intake_items;

-- Create unified SELECT policy
CREATE POLICY "Users see their items or assigned items"
ON public.intake_items
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR created_by = auth.uid()
  OR public.user_can_access_store_location(
       _user_id      := auth.uid(),
       _store_key    := store_key,
       _location_gid := shopify_location_gid
     )
);