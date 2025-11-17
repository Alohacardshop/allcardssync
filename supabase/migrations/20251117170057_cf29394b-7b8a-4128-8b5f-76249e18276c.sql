-- Create print_profiles table for managing label printing profiles
CREATE TABLE IF NOT EXISTS print_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  
  -- Matching rules (all must match for profile to apply)
  match_tags TEXT[], -- e.g., ['graded', 'PSA']
  match_type TEXT, -- 'Raw' or 'Graded'
  match_category TEXT, -- 'tcg', 'comics', 'sports'
  
  -- Label template reference
  template_id UUID REFERENCES label_templates(id),
  
  -- Printer settings
  speed INTEGER DEFAULT 4,
  darkness INTEGER DEFAULT 10,
  copies INTEGER DEFAULT 1,
  
  -- Tag management after print
  add_tags TEXT[] DEFAULT ARRAY['printed'], -- Tags to add after print
  remove_tags TEXT[], -- Tags to remove after print (e.g., 'pending-print')
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast profile matching
CREATE INDEX idx_print_profiles_active ON print_profiles(is_active, priority DESC);

-- RLS policies (admin can manage, staff can view)
ALTER TABLE print_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage print profiles" 
  ON print_profiles FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role = 'admin'
    )
  );

CREATE POLICY "Staff can view print profiles" 
  ON print_profiles FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role IN ('staff', 'admin')
    )
  );

-- Indexes for intake_items print lookups
CREATE INDEX IF NOT EXISTS idx_intake_items_shopify_printed 
  ON intake_items(shopify_product_id, printed_at) 
  WHERE shopify_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_pushed_printed 
  ON intake_items(pushed_at, printed_at) 
  WHERE pushed_at IS NOT NULL;

-- Add updated_at trigger
CREATE TRIGGER set_print_profiles_updated_at
  BEFORE UPDATE ON print_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();