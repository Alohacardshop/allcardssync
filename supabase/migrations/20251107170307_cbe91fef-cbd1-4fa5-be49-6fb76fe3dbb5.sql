-- Phase 1: Update RLS policies to allow any authenticated user to manage alt_items

-- Drop existing role-based policies
DROP POLICY IF EXISTS "Staff can view alt_items" ON public.alt_items;
DROP POLICY IF EXISTS "Staff can manage alt_items" ON public.alt_items;

-- Create new authentication-based policies (no role checking)
CREATE POLICY "Authenticated users can view alt_items"
ON public.alt_items
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert alt_items"
ON public.alt_items
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update alt_items"
ON public.alt_items
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete alt_items"
ON public.alt_items
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);