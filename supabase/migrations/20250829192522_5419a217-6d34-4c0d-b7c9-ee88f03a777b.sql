-- Security Fix Migration: Address Critical Vulnerabilities
-- Fix 1: Secure catalog_v2 schema tables with proper RLS policies

-- Enable RLS on all catalog_v2 tables and add proper policies
ALTER TABLE catalog_v2.sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_v2.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_v2.variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_v2.sync_errors ENABLE ROW LEVEL SECURITY;

-- Create policies for catalog_v2.sets - only admin/staff can access
CREATE POLICY "Staff/Admin can view sets" ON catalog_v2.sets
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage sets" ON catalog_v2.sets
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.cards - only admin/staff can access
CREATE POLICY "Staff/Admin can view cards" ON catalog_v2.cards
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage cards" ON catalog_v2.cards
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.variants - only admin/staff can access
CREATE POLICY "Staff/Admin can view variants" ON catalog_v2.variants
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage variants" ON catalog_v2.variants
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policies for catalog_v2.sync_errors - only admin can access
CREATE POLICY "Admin can view sync errors" ON catalog_v2.sync_errors
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage sync errors" ON catalog_v2.sync_errors
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Secure categories and groups tables (business data)
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view categories" ON categories;
DROP POLICY IF EXISTS "Anyone can insert categories" ON categories;
DROP POLICY IF EXISTS "Anyone can update categories" ON categories;

DROP POLICY IF EXISTS "Anyone can view groups" ON groups;
DROP POLICY IF EXISTS "Anyone can insert groups" ON groups;
DROP POLICY IF EXISTS "Anyone can update groups" ON groups;

-- Create secure policies for categories
CREATE POLICY "Staff/Admin can view categories" ON categories
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage categories" ON categories
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Create secure policies for groups
CREATE POLICY "Staff/Admin can view groups" ON groups
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage groups" ON groups
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Fix 3: Secure label_templates table
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can view label_templates" ON label_templates;
DROP POLICY IF EXISTS "Anyone can insert label_templates" ON label_templates;
DROP POLICY IF EXISTS "Anyone can update label_templates" ON label_templates;
DROP POLICY IF EXISTS "Anyone can delete label_templates" ON label_templates;

-- Create secure policies for label_templates
CREATE POLICY "Staff/Admin can view label_templates" ON label_templates
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can manage label_templates" ON label_templates
FOR ALL USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix 4: Secure print_jobs table
-- Drop existing overly permissive policies
DROP POLICY IF EXISTS "Anyone can insert print_jobs_new" ON print_jobs;

-- The other print_jobs policies are already secure, but let's ensure consistency
CREATE POLICY "Staff/Admin can insert print_jobs" ON print_jobs
FOR INSERT WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix 5: Fix database function search paths to prevent injection attacks
-- Update existing functions to use secure search_path

-- Fix has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

-- Fix generate_lot_number function  
CREATE OR REPLACE FUNCTION public.generate_lot_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_next bigint;
begin
  v_next := nextval('public.lot_number_seq');
  return 'LOT-' || to_char(v_next, 'FM000000');
end;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix set_template_default function
CREATE OR REPLACE FUNCTION public.set_template_default(template_id uuid, template_type_param text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- First, unset all defaults for this template type
  UPDATE public.label_templates 
  SET is_default = false 
  WHERE template_type = template_type_param;
  
  -- Then set the specified template as default
  UPDATE public.label_templates 
  SET is_default = true 
  WHERE id = template_id AND template_type = template_type_param;
END;
$$;

-- Fix claim_next_print_job function
CREATE OR REPLACE FUNCTION public.claim_next_print_job(ws text)
RETURNS print_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH j AS (
    SELECT id FROM public.print_jobs
     WHERE status = 'queued' AND workstation_id = ws
     ORDER BY created_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  UPDATE public.print_jobs p
     SET status='printing', claimed_at=now()
    FROM j
   WHERE p.id = j.id
  RETURNING p.*;
$$;