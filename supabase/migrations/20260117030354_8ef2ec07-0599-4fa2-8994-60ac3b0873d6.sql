-- eBay Listing Templates table
CREATE TABLE public.ebay_listing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Category settings
  category_id TEXT NOT NULL,
  category_name TEXT,
  
  -- Condition settings
  condition_id TEXT NOT NULL DEFAULT '2750', -- '2750' for graded, '4000' for ungraded
  is_graded BOOLEAN DEFAULT true,
  
  -- Template fields
  title_template TEXT,
  description_template TEXT,
  
  -- Item aspects mapping (JSON - maps intake fields to eBay aspects)
  aspects_mapping JSONB DEFAULT '{}',
  
  -- Default values
  default_grader TEXT DEFAULT 'PSA',
  
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- eBay Category Mappings table for auto-detection
CREATE TABLE public.ebay_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key TEXT NOT NULL,
  
  -- Detection rules
  keyword_pattern TEXT,
  brand_match TEXT[],
  main_category TEXT, -- 'tcg', 'comics', 'sports'
  
  -- eBay category
  category_id TEXT NOT NULL,
  category_name TEXT NOT NULL,
  
  -- Template to use
  default_template_id UUID REFERENCES public.ebay_listing_templates(id) ON DELETE SET NULL,
  
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ebay_listing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ebay_category_mappings ENABLE ROW LEVEL SECURITY;

-- RLS policies for templates
CREATE POLICY "Authenticated users can view templates"
  ON public.ebay_listing_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert templates"
  ON public.ebay_listing_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update templates"
  ON public.ebay_listing_templates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete templates"
  ON public.ebay_listing_templates FOR DELETE
  TO authenticated
  USING (true);

-- RLS policies for category mappings
CREATE POLICY "Authenticated users can view category mappings"
  ON public.ebay_category_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert category mappings"
  ON public.ebay_category_mappings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update category mappings"
  ON public.ebay_category_mappings FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete category mappings"
  ON public.ebay_category_mappings FOR DELETE
  TO authenticated
  USING (true);

-- Indexes
CREATE INDEX idx_ebay_listing_templates_store ON public.ebay_listing_templates(store_key);
CREATE INDEX idx_ebay_listing_templates_default ON public.ebay_listing_templates(store_key, is_default) WHERE is_default = true;
CREATE INDEX idx_ebay_category_mappings_store ON public.ebay_category_mappings(store_key);
CREATE INDEX idx_ebay_category_mappings_main_cat ON public.ebay_category_mappings(store_key, main_category);

-- Insert default category mappings for common trading card types
INSERT INTO public.ebay_category_mappings (store_key, main_category, brand_match, category_id, category_name, priority) VALUES
  ('hawaii', 'tcg', ARRAY['Pokemon', 'Pokémon', 'MTG', 'Magic', 'Yu-Gi-Oh', 'Yugioh', 'One Piece', 'Dragon Ball', 'Weiss Schwarz', 'Cardfight', 'Flesh and Blood', 'Lorcana'], '183454', 'CCG Individual Cards', 10),
  ('hawaii', 'sports', ARRAY['Topps', 'Panini', 'Upper Deck', 'Bowman', 'Donruss', 'Prizm', 'Select', 'Fleer', 'Score'], '261328', 'Sports Trading Cards Singles', 10),
  ('hawaii', 'comics', ARRAY['Marvel', 'DC', 'Image', 'Dark Horse', 'IDW'], '63', 'Collectible Comic Books', 10),
  ('lasvegas', 'tcg', ARRAY['Pokemon', 'Pokémon', 'MTG', 'Magic', 'Yu-Gi-Oh', 'Yugioh', 'One Piece', 'Dragon Ball', 'Weiss Schwarz', 'Cardfight', 'Flesh and Blood', 'Lorcana'], '183454', 'CCG Individual Cards', 10),
  ('lasvegas', 'sports', ARRAY['Topps', 'Panini', 'Upper Deck', 'Bowman', 'Donruss', 'Prizm', 'Select', 'Fleer', 'Score'], '261328', 'Sports Trading Cards Singles', 10),
  ('lasvegas', 'comics', ARRAY['Marvel', 'DC', 'Image', 'Dark Horse', 'IDW'], '63', 'Collectible Comic Books', 10);

-- Insert default templates
INSERT INTO public.ebay_listing_templates (store_key, name, description, category_id, category_name, condition_id, is_graded, title_template, description_template, default_grader, is_default) VALUES
  ('hawaii', 'Graded TCG Card', 'Template for PSA/CGC graded trading cards', '183454', 'CCG Individual Cards', '2750', true, 
   '{year} {brand_title} {subject} #{card_number} {grade} {grading_company}',
   '<h2>{subject}</h2><p><strong>Year:</strong> {year}</p><p><strong>Brand:</strong> {brand_title}</p><p><strong>Card #:</strong> {card_number}</p><p><strong>Grade:</strong> {grade} {grading_company}</p><p><strong>Cert:</strong> {psa_cert}</p>',
   'PSA', true),
  ('hawaii', 'Raw TCG Card', 'Template for ungraded trading cards', '183454', 'CCG Individual Cards', '4000', false,
   '{year} {brand_title} {subject} #{card_number}',
   '<h2>{subject}</h2><p><strong>Year:</strong> {year}</p><p><strong>Brand:</strong> {brand_title}</p><p><strong>Card #:</strong> {card_number}</p><p><strong>Condition:</strong> Near Mint</p>',
   NULL, false),
  ('hawaii', 'Graded Sports Card', 'Template for PSA/BGS graded sports cards', '261328', 'Sports Trading Cards Singles', '2750', true,
   '{year} {brand_title} {subject} #{card_number} {grade} {grading_company}',
   '<h2>{subject}</h2><p><strong>Year:</strong> {year}</p><p><strong>Brand:</strong> {brand_title}</p><p><strong>Card #:</strong> {card_number}</p><p><strong>Grade:</strong> {grade} {grading_company}</p><p><strong>Cert:</strong> {psa_cert}</p>',
   'PSA', false),
  ('lasvegas', 'Graded TCG Card', 'Template for PSA/CGC graded trading cards', '183454', 'CCG Individual Cards', '2750', true,
   '{year} {brand_title} {subject} #{card_number} {grade} {grading_company}',
   '<h2>{subject}</h2><p><strong>Year:</strong> {year}</p><p><strong>Brand:</strong> {brand_title}</p><p><strong>Card #:</strong> {card_number}</p><p><strong>Grade:</strong> {grade} {grading_company}</p><p><strong>Cert:</strong> {psa_cert}</p>',
   'PSA', true),
  ('lasvegas', 'Raw TCG Card', 'Template for ungraded trading cards', '183454', 'CCG Individual Cards', '4000', false,
   '{year} {brand_title} {subject} #{card_number}',
   '<h2>{subject}</h2><p><strong>Year:</strong> {year}</p><p><strong>Brand:</strong> {brand_title}</p><p><strong>Card #:</strong> {card_number}</p><p><strong>Condition:</strong> Near Mint</p>',
   NULL, false);