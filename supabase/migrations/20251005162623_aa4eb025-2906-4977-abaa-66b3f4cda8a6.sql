-- Create shopify_location_vendors table
CREATE TABLE IF NOT EXISTS public.shopify_location_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key TEXT NOT NULL REFERENCES public.shopify_stores(key) ON DELETE CASCADE,
  location_gid TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(store_key, location_gid, vendor_name)
);

-- Create index for faster lookups
CREATE INDEX idx_shopify_location_vendors_lookup ON public.shopify_location_vendors(store_key, location_gid);

-- Enable RLS
ALTER TABLE public.shopify_location_vendors ENABLE ROW LEVEL SECURITY;

-- Staff/Admin can view vendors
CREATE POLICY "Staff/Admin can view vendors"
  ON public.shopify_location_vendors
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Admin can manage vendors
CREATE POLICY "Admin can manage vendors"
  ON public.shopify_location_vendors
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed initial vendor data for Hawaii
INSERT INTO public.shopify_location_vendors (store_key, location_gid, vendor_name, is_default)
VALUES 
  ('hawaii', 'gid://shopify/Location/98655813913', 'Aloha Card Shop Hawaii', true)
ON CONFLICT (store_key, location_gid, vendor_name) DO NOTHING;

-- Seed initial vendor data for Las Vegas
INSERT INTO public.shopify_location_vendors (store_key, location_gid, vendor_name, is_default)
VALUES 
  ('las_vegas', 'gid://shopify/Location/98866905401', 'Aloha Card Shop Las Vegas', true),
  ('las_vegas', 'gid://shopify/Location/98866905401', 'Josh', false)
ON CONFLICT (store_key, location_gid, vendor_name) DO NOTHING;