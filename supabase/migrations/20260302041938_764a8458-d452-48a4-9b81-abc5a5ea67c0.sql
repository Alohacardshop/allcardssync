
-- Update trigger to auto-generate shopify_tags from intake metadata when tags are missing
CREATE OR REPLACE FUNCTION public.trigger_normalize_tags()
RETURNS TRIGGER AS $$
DECLARE
  v_generated_tags TEXT[] := '{}';
BEGIN
  -- If shopify_tags is NULL on INSERT, generate initial tags from available metadata
  IF NEW.shopify_tags IS NULL AND TG_OP = 'INSERT' THEN
    -- Add grading company tag
    IF NEW.grading_company IS NOT NULL AND NEW.grading_company != 'none' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.grading_company)];
      v_generated_tags := v_generated_tags || ARRAY['graded'];
    END IF;
    
    -- Add grade tag
    IF NEW.grade IS NOT NULL AND NEW.grade != '' THEN
      v_generated_tags := v_generated_tags || ARRAY['grade-' || lower(regexp_replace(NEW.grade, '[^a-zA-Z0-9.]', '', 'g'))];
    END IF;
    
    -- Add main category tag
    IF NEW.main_category IS NOT NULL AND NEW.main_category != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.main_category)];
    END IF;
    
    -- Add sub category tag
    IF NEW.sub_category IS NOT NULL AND NEW.sub_category != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.sub_category)];
    END IF;
    
    -- Add brand tag
    IF NEW.brand_title IS NOT NULL AND NEW.brand_title != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.brand_title)];
    END IF;
    
    -- Add year tag
    IF NEW.year IS NOT NULL AND NEW.year != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[NEW.year];
    END IF;
    
    -- Add vendor/source tag
    IF NEW.vendor IS NOT NULL AND NEW.vendor != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.vendor)];
    END IF;
    
    -- Add psa/cgc cert indicator
    IF NEW.psa_cert IS NOT NULL THEN
      v_generated_tags := v_generated_tags || ARRAY['psa'];
    END IF;
    IF NEW.cgc_cert IS NOT NULL THEN
      v_generated_tags := v_generated_tags || ARRAY['cgc'];
    END IF;

    -- Only set if we generated any tags
    IF array_length(v_generated_tags, 1) > 0 THEN
      NEW.shopify_tags := v_generated_tags;
    END IF;
  END IF;

  -- Normalize tags from shopify_tags
  IF NEW.shopify_tags IS NOT NULL THEN
    NEW.normalized_tags := public.normalize_shopify_tags(NEW.shopify_tags);
  END IF;
  
  -- Derive primary category from normalized tags or existing fields
  IF NEW.normalized_tags IS NOT NULL THEN
    IF 'pokemon' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'pokemon';
    ELSIF 'sports' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'sports';
    ELSIF 'comics' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'comics';
    ELSIF 'tcg' = ANY(NEW.normalized_tags) THEN
      NEW.primary_category := 'tcg';
    ELSIF NEW.main_category IS NOT NULL THEN
      NEW.primary_category := NEW.main_category;
    END IF;
  ELSIF NEW.main_category IS NOT NULL THEN
    NEW.primary_category := NEW.main_category;
  END IF;
  
  -- Derive condition type from normalized tags or grading fields
  IF NEW.normalized_tags IS NOT NULL AND 'graded' = ANY(NEW.normalized_tags) THEN
    NEW.condition_type := 'graded';
  ELSIF NEW.normalized_tags IS NOT NULL AND 'sealed' = ANY(NEW.normalized_tags) THEN
    NEW.condition_type := 'sealed';
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

-- Backfill existing items that have metadata but no tags
UPDATE public.intake_items
SET 
  shopify_tags = ARRAY(
    SELECT unnest FROM (
      SELECT lower(grading_company) AS unnest WHERE grading_company IS NOT NULL AND grading_company != 'none'
      UNION SELECT 'graded' WHERE grading_company IS NOT NULL AND grading_company != 'none'
      UNION SELECT 'grade-' || lower(regexp_replace(grade, '[^a-zA-Z0-9.]', '', 'g')) WHERE grade IS NOT NULL AND grade != ''
      UNION SELECT lower(main_category) WHERE main_category IS NOT NULL AND main_category != ''
      UNION SELECT lower(sub_category) WHERE sub_category IS NOT NULL AND sub_category != ''
      UNION SELECT lower(brand_title) WHERE brand_title IS NOT NULL AND brand_title != ''
      UNION SELECT year WHERE year IS NOT NULL AND year != ''
      UNION SELECT 'psa' WHERE psa_cert IS NOT NULL
      UNION SELECT 'cgc' WHERE cgc_cert IS NOT NULL
    ) sub
  )
WHERE shopify_tags IS NULL
  AND deleted_at IS NULL
  AND (grading_company IS NOT NULL AND grading_company != 'none'
    OR main_category IS NOT NULL
    OR grade IS NOT NULL
    OR brand_title IS NOT NULL);
