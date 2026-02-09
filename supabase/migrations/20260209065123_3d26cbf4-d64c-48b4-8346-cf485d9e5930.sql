
-- Create ebay_categories table for admin-managed eBay category list
CREATE TABLE public.ebay_categories (
  id TEXT NOT NULL PRIMARY KEY,  -- eBay category ID (e.g., '183454')
  name TEXT NOT NULL,            -- Display name (e.g., 'CCG Individual Cards')
  parent_id TEXT,                -- Optional parent category for hierarchy
  item_type TEXT,                -- 'tcg', 'sports', 'comics', 'other'
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ebay_categories ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "Anyone can view ebay categories"
  ON public.ebay_categories FOR SELECT
  USING (true);

-- Allow authenticated users to manage (admin app)
CREATE POLICY "Authenticated users can manage ebay categories"
  ON public.ebay_categories FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed with common trading card categories
INSERT INTO public.ebay_categories (id, name, item_type, sort_order) VALUES
  ('183454', 'CCG Individual Cards (Pokemon, MTG, etc.)', 'tcg', 1),
  ('261328', 'Sports Trading Cards', 'sports', 2),
  ('183050', 'Non-Sport Trading Cards', 'other', 3),
  ('213', 'Baseball Cards', 'sports', 4),
  ('214215', 'Basketball Cards', 'sports', 5),
  ('215', 'Football Cards', 'sports', 6),
  ('216', 'Hockey Cards', 'sports', 7),
  ('218', 'Soccer Cards', 'sports', 8),
  ('217', 'Racing Cards', 'sports', 9),
  ('183062', 'Wrestling Cards', 'sports', 10),
  ('63', 'Comic Books', 'comics', 11),
  ('259061', 'Graded Comic Books', 'comics', 12),
  ('260', 'Bronze Age Comics', 'comics', 13),
  ('137939', 'Silver Age Comics', 'comics', 14),
  ('138973', 'Modern Age Comics', 'comics', 15),
  ('137938', 'Golden Age Comics', 'comics', 16),
  ('64482', 'Sports Memorabilia', 'sports', 17);

-- Trigger for updated_at
CREATE TRIGGER update_ebay_categories_updated_at
  BEFORE UPDATE ON public.ebay_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
