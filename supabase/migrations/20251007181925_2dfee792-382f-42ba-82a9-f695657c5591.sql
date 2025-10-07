-- Fix RLS policies for user_shopify_assignments to allow admin access

-- Drop all existing policies on user_shopify_assignments
DROP POLICY IF EXISTS "Users can view their own assignments" ON user_shopify_assignments;
DROP POLICY IF EXISTS "Users can manage their own assignments" ON user_shopify_assignments;
DROP POLICY IF EXISTS "Admins can view all assignments, users view own" ON user_shopify_assignments;
DROP POLICY IF EXISTS "Admins can create assignments" ON user_shopify_assignments;
DROP POLICY IF EXISTS "Admins can update assignments" ON user_shopify_assignments;
DROP POLICY IF EXISTS "Admins can delete assignments" ON user_shopify_assignments;

-- Create comprehensive policies that allow admins full access

-- SELECT: Admins can view all assignments, users can view their own
CREATE POLICY "admin_view_all_user_select" 
ON user_shopify_assignments 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR user_id = auth.uid()
);

-- INSERT: Admins can create any assignment
CREATE POLICY "admin_insert_assignments" 
ON user_shopify_assignments 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- UPDATE: Admins can update any assignment
CREATE POLICY "admin_update_assignments" 
ON user_shopify_assignments 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- DELETE: Admins can delete any assignment
CREATE POLICY "admin_delete_assignments" 
ON user_shopify_assignments 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));