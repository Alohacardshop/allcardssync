-- ================================================
-- Phase 1: eBay Sync Rules, Region Settings & Legacy Protection
-- ================================================

-- 1.1 Create ebay_sync_rules table for include/exclude rules
CREATE TABLE public.ebay_sync_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key TEXT NOT NULL,
  name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('include', 'exclude')),
  category_match TEXT[] DEFAULT '{}',
  brand_match TEXT[] DEFAULT '{}',
  min_price DECIMAL(10,2),
  max_price DECIMAL(10,2),
  graded_only BOOLEAN DEFAULT FALSE,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  auto_queue BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Add legacy protection columns to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS ebay_managed_externally BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ebay_legacy_import_at TIMESTAMPTZ;

-- 1.3 Create region_settings table for per-region configuration
CREATE TABLE public.region_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id TEXT NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(region_id, setting_key)
);

-- ================================================
-- RLS Policies
-- ================================================

-- Enable RLS on ebay_sync_rules
ALTER TABLE public.ebay_sync_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view sync rules" 
ON public.ebay_sync_rules 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage sync rules" 
ON public.ebay_sync_rules 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Enable RLS on region_settings
ALTER TABLE public.region_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view region settings" 
ON public.region_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage region settings" 
ON public.region_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- ================================================
-- Indexes for performance
-- ================================================

CREATE INDEX idx_ebay_sync_rules_store ON public.ebay_sync_rules(store_key);
CREATE INDEX idx_ebay_sync_rules_active ON public.ebay_sync_rules(store_key, is_active) WHERE is_active = true;
CREATE INDEX idx_region_settings_region ON public.region_settings(region_id);
CREATE INDEX idx_intake_items_ebay_external ON public.intake_items(ebay_managed_externally) WHERE ebay_managed_externally = true;

-- ================================================
-- Trigger for updated_at
-- ================================================

CREATE TRIGGER update_ebay_sync_rules_updated_at
BEFORE UPDATE ON public.ebay_sync_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_region_settings_updated_at
BEFORE UPDATE ON public.region_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================
-- Insert default region settings for Hawaii and Las Vegas
-- ================================================

INSERT INTO public.region_settings (region_id, setting_key, setting_value, description) VALUES
-- Hawaii defaults
('hawaii', 'branding.accent_color', '"hsl(174, 62%, 47%)"', 'Primary accent color for Hawaii region'),
('hawaii', 'branding.icon', '"🌺"', 'Icon emoji for Hawaii region'),
('hawaii', 'branding.display_name', '"Aloha Cards Hawaii"', 'Display name for Hawaii region'),
('hawaii', 'ebay.default_min_price', '25', 'Minimum price threshold for eBay listings'),
('hawaii', 'ebay.auto_sync_enabled', 'false', 'Whether to auto-queue items for eBay sync'),
('hawaii', 'operations.business_hours', '{"start": 10, "end": 19, "timezone": "Pacific/Honolulu"}', 'Business hours for operations'),

-- Las Vegas defaults
('las_vegas', 'branding.accent_color', '"hsl(45, 93%, 47%)"', 'Primary accent color for Las Vegas region'),
('las_vegas', 'branding.icon', '"🎰"', 'Icon emoji for Las Vegas region'),
('las_vegas', 'branding.display_name', '"Aloha Cards Las Vegas"', 'Display name for Las Vegas region'),
('las_vegas', 'ebay.default_min_price', '25', 'Minimum price threshold for eBay listings'),
('las_vegas', 'ebay.auto_sync_enabled', 'false', 'Whether to auto-queue items for eBay sync'),
('las_vegas', 'operations.business_hours', '{"start": 10, "end": 20, "timezone": "America/Los_Angeles"}', 'Business hours for operations')
ON CONFLICT (region_id, setting_key) DO NOTHING;