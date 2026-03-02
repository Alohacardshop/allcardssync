-- 1. Fix mutable search_path on trigger functions
CREATE OR REPLACE FUNCTION public.update_cards_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_shopify_inventory_levels_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

-- 2. Move pg_trgm extension from public to extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 3. Tighten overly permissive RLS policies on ebay_category_mappings (restrict to staff/admin)
DROP POLICY IF EXISTS "Authenticated users can delete category mappings" ON public.ebay_category_mappings;
DROP POLICY IF EXISTS "Authenticated users can insert category mappings" ON public.ebay_category_mappings;
DROP POLICY IF EXISTS "Authenticated users can update category mappings" ON public.ebay_category_mappings;

CREATE POLICY "Staff/admin can insert category mappings"
  ON public.ebay_category_mappings FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff/admin can update category mappings"
  ON public.ebay_category_mappings FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff/admin can delete category mappings"
  ON public.ebay_category_mappings FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- 4. Tighten overly permissive RLS policies on ebay_listing_templates (restrict to staff/admin)
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.ebay_listing_templates;
DROP POLICY IF EXISTS "Authenticated users can insert templates" ON public.ebay_listing_templates;
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.ebay_listing_templates;

CREATE POLICY "Staff/admin can insert templates"
  ON public.ebay_listing_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff/admin can update templates"
  ON public.ebay_listing_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff/admin can delete templates"
  ON public.ebay_listing_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

-- 5. Tighten overly permissive RLS policies on shopify_sync_queue (restrict to staff/admin + service_role)
DROP POLICY IF EXISTS "System can insert into sync queue" ON public.shopify_sync_queue;
DROP POLICY IF EXISTS "System can update sync queue" ON public.shopify_sync_queue;

CREATE POLICY "Staff/admin can insert into sync queue"
  ON public.shopify_sync_queue FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));

CREATE POLICY "Staff/admin can update sync queue"
  ON public.shopify_sync_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'staff'));