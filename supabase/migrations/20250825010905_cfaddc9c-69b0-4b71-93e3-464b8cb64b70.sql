-- Add DELETE policy for admin users on print_jobs table
CREATE POLICY "Staff/Admin can delete print_jobs" 
ON public.print_jobs 
FOR DELETE 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));