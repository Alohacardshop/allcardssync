-- Create purchase_locations table for tracking where items were purchased
CREATE TABLE IF NOT EXISTS public.purchase_locations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_locations ENABLE ROW LEVEL SECURITY;

-- Admin can manage purchase locations
CREATE POLICY "Admins can manage purchase_locations"
  ON public.purchase_locations
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Staff can view purchase locations
CREATE POLICY "Staff can view purchase_locations"
  ON public.purchase_locations
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add purchase_location_id column to intake_items
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS purchase_location_id uuid REFERENCES public.purchase_locations(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_intake_items_purchase_location ON public.intake_items(purchase_location_id);

-- Insert default "In Store" location
INSERT INTO public.purchase_locations (name, description, sort_order, is_active)
VALUES ('In Store', 'Items purchased in physical store', 0, true)
ON CONFLICT (name) DO NOTHING;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_purchase_locations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_purchase_locations_updated_at
  BEFORE UPDATE ON public.purchase_locations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_purchase_locations_updated_at();