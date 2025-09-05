-- Fix critical security vulnerability in audit_log table
-- The current "System can insert audit logs" policy allows anyone to insert records
-- This should be restricted to authenticated users with proper roles

-- Drop the overly permissive insert policy
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;

-- Create a new secure insert policy that requires authentication
-- Only staff and admin users should be able to create audit log entries
CREATE POLICY "Authenticated users can insert audit logs" 
ON public.audit_log 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL 
  AND (
    has_role(auth.uid(), 'staff'::app_role) 
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);

-- Add a comment to document the security fix
COMMENT ON POLICY "Authenticated users can insert audit logs" ON public.audit_log 
IS 'Fixed security vulnerability: Only authenticated staff/admin users can insert audit log entries';