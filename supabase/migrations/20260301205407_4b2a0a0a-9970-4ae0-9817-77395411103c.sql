
-- Create tag_category_mappings table
CREATE TABLE public.tag_category_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_value text NOT NULL UNIQUE,
  primary_category text,
  condition_type text,
  ebay_category_id text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tag_category_mappings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read
CREATE POLICY "Authenticated users can read tag_category_mappings"
ON public.tag_category_mappings FOR SELECT TO authenticated USING (true);

-- Only admins can insert/update/delete
CREATE POLICY "Admins can insert tag_category_mappings"
ON public.tag_category_mappings FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update tag_category_mappings"
ON public.tag_category_mappings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete tag_category_mappings"
ON public.tag_category_mappings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Seed with current hardcoded mappings
INSERT INTO public.tag_category_mappings (tag_value, primary_category, condition_type, ebay_category_id) VALUES
  ('pokemon', 'pokemon', NULL, '183454'),
  ('pokémon', 'pokemon', NULL, '183454'),
  ('sports', 'sports', NULL, '261328'),
  ('comics', 'comics', NULL, '63'),
  ('tcg', 'tcg', NULL, '183454'),
  ('manga', 'comics', NULL, '63'),
  ('graded', NULL, 'graded', NULL),
  ('sealed', NULL, 'sealed', NULL),
  ('raw', NULL, 'raw', NULL);

-- Update trigger to read from table instead of hardcoded values
CREATE OR REPLACE FUNCTION public.trigger_normalize_tags()
RETURNS TRIGGER AS $$
DECLARE
  mapping RECORD;
BEGIN
  -- Normalize tags from shopify_tags
  IF NEW.shopify_tags IS NOT NULL THEN
    NEW.normalized_tags := public.normalize_shopify_tags(NEW.shopify_tags);
  END IF;

  -- Derive primary_category from tag_category_mappings table
  IF NEW.normalized_tags IS NOT NULL THEN
    -- Check for primary_category match
    SELECT tcm.primary_category INTO NEW.primary_category
    FROM public.tag_category_mappings tcm
    WHERE tcm.is_active = true
      AND tcm.primary_category IS NOT NULL
      AND tcm.tag_value = ANY(NEW.normalized_tags)
    LIMIT 1;

    -- Fallback to main_category if no match
    IF NEW.primary_category IS NULL AND NEW.main_category IS NOT NULL THEN
      NEW.primary_category := NEW.main_category;
    END IF;
  ELSIF NEW.main_category IS NOT NULL THEN
    NEW.primary_category := NEW.main_category;
  END IF;

  -- Derive condition_type from tag_category_mappings table
  IF NEW.normalized_tags IS NOT NULL THEN
    SELECT tcm.condition_type INTO mapping
    FROM public.tag_category_mappings tcm
    WHERE tcm.is_active = true
      AND tcm.condition_type IS NOT NULL
      AND tcm.tag_value = ANY(NEW.normalized_tags)
    LIMIT 1;

    IF mapping.condition_type IS NOT NULL THEN
      NEW.condition_type := mapping.condition_type;
    ELSIF NEW.grade IS NOT NULL OR NEW.psa_cert IS NOT NULL OR NEW.cgc_cert IS NOT NULL THEN
      NEW.condition_type := 'graded';
    ELSIF NEW.type = 'Graded' THEN
      NEW.condition_type := 'graded';
    ELSE
      NEW.condition_type := 'raw';
    END IF;
  ELSIF NEW.grade IS NOT NULL OR NEW.psa_cert IS NOT NULL OR NEW.cgc_cert IS NOT NULL THEN
    NEW.condition_type := 'graded';
  ELSIF NEW.type = 'Graded' THEN
    NEW.condition_type := 'graded';
  ELSE
    NEW.condition_type := 'raw';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Add updated_at trigger
CREATE TRIGGER update_tag_category_mappings_updated_at
BEFORE UPDATE ON public.tag_category_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
