-- Fix security issue: Restrict access to sensitive business data tables
-- Drop existing overly permissive policies

-- Drop policies for trade_ins table
DROP POLICY IF EXISTS "Anyone can insert trade_ins" ON public.trade_ins;
DROP POLICY IF EXISTS "Anyone can update trade_ins" ON public.trade_ins;
DROP POLICY IF EXISTS "Anyone can view trade_ins" ON public.trade_ins;

-- Drop policies for products table  
DROP POLICY IF EXISTS "Anyone can insert products" ON public.products;
DROP POLICY IF EXISTS "Anyone can update products" ON public.products;
DROP POLICY IF EXISTS "Anyone can view products" ON public.products;

-- Drop policies for product_sync_status table
DROP POLICY IF EXISTS "Anyone can insert sync status" ON public.product_sync_status;
DROP POLICY IF EXISTS "Anyone can update sync status" ON public.product_sync_status;
DROP POLICY IF EXISTS "Anyone can view sync status" ON public.product_sync_status;

-- Create secure policies for trade_ins table (staff/admin access only)
CREATE POLICY "Staff/Admin can view trade_ins" 
ON public.trade_ins 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can insert trade_ins" 
ON public.trade_ins 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can update trade_ins" 
ON public.trade_ins 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create secure policies for products table (staff/admin access only)
CREATE POLICY "Staff/Admin can view products" 
ON public.products 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can insert products" 
ON public.products 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can update products" 
ON public.products 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create secure policies for product_sync_status table (staff/admin access only)
CREATE POLICY "Staff/Admin can view product_sync_status" 
ON public.product_sync_status 
FOR SELECT 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can insert product_sync_status" 
ON public.product_sync_status 
FOR INSERT 
TO authenticated
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can update product_sync_status" 
ON public.product_sync_status 
FOR UPDATE 
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));