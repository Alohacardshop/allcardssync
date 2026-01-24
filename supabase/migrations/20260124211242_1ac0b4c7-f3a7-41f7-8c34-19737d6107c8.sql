-- Phase 1: Regional Enhancements Database Schema

-- 1.1 Enhance Audit Log with Region Tracking
ALTER TABLE audit_log 
ADD COLUMN IF NOT EXISTS region_id TEXT,
ADD COLUMN IF NOT EXISTS location_gid TEXT,
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Create indexes for region-based queries
CREATE INDEX IF NOT EXISTS idx_audit_log_region ON audit_log(region_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id);

-- 1.2 Create Cross-Region Transfer Request Table
CREATE TABLE IF NOT EXISTS cross_region_transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  source_region TEXT NOT NULL,
  destination_region TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'in_transit', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tracking_number TEXT,
  estimated_arrival DATE,
  total_items INTEGER DEFAULT 0
);

-- Items in each transfer request
CREATE TABLE IF NOT EXISTS cross_region_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_id UUID NOT NULL REFERENCES cross_region_transfer_requests(id) ON DELETE CASCADE,
  intake_item_id UUID REFERENCES intake_items(id),
  sku TEXT NOT NULL,
  item_name TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'packed', 'shipped', 'received', 'cancelled')),
  received_at TIMESTAMPTZ,
  received_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Indexes for transfer tables
CREATE INDEX IF NOT EXISTS idx_cross_transfer_requests_status ON cross_region_transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_cross_transfer_requests_source ON cross_region_transfer_requests(source_region);
CREATE INDEX IF NOT EXISTS idx_cross_transfer_requests_dest ON cross_region_transfer_requests(destination_region);
CREATE INDEX IF NOT EXISTS idx_cross_transfer_items_request ON cross_region_transfer_items(request_id);
CREATE INDEX IF NOT EXISTS idx_cross_transfer_items_sku ON cross_region_transfer_items(sku);

-- Updated at trigger for transfer requests
CREATE OR REPLACE TRIGGER update_cross_region_transfer_requests_updated_at
  BEFORE UPDATE ON cross_region_transfer_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 1.3 Enable RLS on new tables
ALTER TABLE cross_region_transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_region_transfer_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cross_region_transfer_requests
CREATE POLICY "Authenticated users can view transfer requests"
  ON cross_region_transfer_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and staff can create transfer requests"
  ON cross_region_transfer_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Admin and staff can update transfer requests"
  ON cross_region_transfer_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
  );

-- RLS Policies for cross_region_transfer_items
CREATE POLICY "Authenticated users can view transfer items"
  ON cross_region_transfer_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and staff can manage transfer items"
  ON cross_region_transfer_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
  );

-- 1.4 Add region-specific Discord settings to region_settings
INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES 
  ('hawaii', 'discord.webhook_url', '""', 'Hawaii-specific Discord webhook URL'),
  ('hawaii', 'discord.channel_name', '"#hawaii-orders"', 'Discord channel name for Hawaii notifications'),
  ('hawaii', 'discord.role_id', '""', 'Discord role ID to mention for Hawaii orders'),
  ('hawaii', 'discord.enabled', 'true', 'Enable Discord notifications for Hawaii'),
  ('las_vegas', 'discord.webhook_url', '""', 'Las Vegas-specific Discord webhook URL'),
  ('las_vegas', 'discord.channel_name', '"#vegas-orders"', 'Discord channel name for Las Vegas notifications'),
  ('las_vegas', 'discord.role_id', '""', 'Discord role ID to mention for Las Vegas orders'),
  ('las_vegas', 'discord.enabled', 'true', 'Enable Discord notifications for Las Vegas')
ON CONFLICT (region_id, setting_key) DO NOTHING;

-- 1.5 Create scheduled_ebay_listings table for time-zone aware scheduling
CREATE TABLE IF NOT EXISTS scheduled_ebay_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  intake_item_id UUID REFERENCES intake_items(id) ON DELETE CASCADE,
  region_id TEXT NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'published', 'cancelled', 'failed')),
  created_by UUID REFERENCES auth.users(id),
  published_at TIMESTAMPTZ,
  error_message TEXT
);

-- Indexes for scheduled listings
CREATE INDEX IF NOT EXISTS idx_scheduled_ebay_listings_status ON scheduled_ebay_listings(status);
CREATE INDEX IF NOT EXISTS idx_scheduled_ebay_listings_scheduled_time ON scheduled_ebay_listings(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_scheduled_ebay_listings_region ON scheduled_ebay_listings(region_id);

-- RLS for scheduled_ebay_listings
ALTER TABLE scheduled_ebay_listings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view scheduled listings"
  ON scheduled_ebay_listings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin and staff can manage scheduled listings"
  ON scheduled_ebay_listings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() 
      AND role IN ('admin', 'staff')
    )
  );

-- Updated at trigger for scheduled listings
CREATE OR REPLACE TRIGGER update_scheduled_ebay_listings_updated_at
  BEFORE UPDATE ON scheduled_ebay_listings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();