-- Fix RLS policy for region_settings - needs WITH CHECK for INSERT/UPDATE
DROP POLICY IF EXISTS "Admin can manage region settings" ON public.region_settings;

CREATE POLICY "Admin can manage region settings" 
ON public.region_settings 
FOR ALL 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));