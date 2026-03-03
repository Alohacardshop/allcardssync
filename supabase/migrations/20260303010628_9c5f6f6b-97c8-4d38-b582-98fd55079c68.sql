
-- Update trigger_normalize_tags to add card, raw, comics tags
CREATE OR REPLACE FUNCTION public.trigger_normalize_tags()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lower text;
  v_tag text;
  v_norm text[] := '{}';
  v_cat text := NULL;
  v_cond text := NULL;
  v_generated_tags text[] := '{}';
BEGIN
  -- AUTO-GENERATE shopify_tags from metadata if NULL (on INSERT or UPDATE)
  IF NEW.shopify_tags IS NULL THEN
    -- Build tags from available metadata
    IF NEW.grading_company IS NOT NULL AND NEW.grading_company != '' AND lower(NEW.grading_company) != 'none' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.grading_company)];
      v_generated_tags := v_generated_tags || ARRAY['graded'];
    END IF;

    IF NEW.grade IS NOT NULL AND NEW.grade != '' THEN
      v_generated_tags := v_generated_tags || ARRAY['grade-' || lower(replace(NEW.grade, ' ', '-'))];
    END IF;

    IF NEW.main_category IS NOT NULL AND NEW.main_category != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.main_category)];
    END IF;

    IF NEW.brand_title IS NOT NULL AND NEW.brand_title != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.brand_title)];
    END IF;

    IF NEW.year IS NOT NULL AND NEW.year != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[NEW.year];
    END IF;

    IF NEW.psa_cert IS NOT NULL OR NEW.psa_cert_number IS NOT NULL THEN
      v_generated_tags := v_generated_tags || ARRAY['psa-certified'];
    END IF;

    IF NEW.cgc_cert IS NOT NULL THEN
      v_generated_tags := v_generated_tags || ARRAY['cgc-certified'];
    END IF;

    IF NEW.sub_category IS NOT NULL AND NEW.sub_category != '' THEN
      v_generated_tags := v_generated_tags || ARRAY[lower(NEW.sub_category)];
    END IF;

    -- Add "card" tag for card-based categories
    IF NEW.main_category IN ('tcg', 'sports') THEN
      v_generated_tags := v_generated_tags || ARRAY['card'];
    END IF;

    -- Add "comics" tag explicitly for comics category
    IF NEW.main_category = 'comics' AND NOT 'comics' = ANY(v_generated_tags) THEN
      v_generated_tags := v_generated_tags || ARRAY['comics'];
    END IF;

    -- Add "raw" tag for non-graded items
    IF NEW.grading_company IS NULL OR lower(NEW.grading_company) IN ('none', '') THEN
      v_generated_tags := v_generated_tags || ARRAY['raw'];
    END IF;

    -- Only set if we generated any tags
    IF array_length(v_generated_tags, 1) > 0 THEN
      NEW.shopify_tags := v_generated_tags;
    END IF;
  END IF;

  -- If still NULL after generation attempt, nothing to normalize
  IF NEW.shopify_tags IS NULL THEN
    RETURN NEW;
  END IF;

  -- Normalize each tag
  FOREACH v_tag IN ARRAY NEW.shopify_tags LOOP
    v_lower := lower(trim(v_tag));

    -- Skip empties
    IF v_lower = '' THEN CONTINUE; END IF;

    -- Normalize known variations
    CASE
      WHEN v_lower IN ('pkmn','pokémon','pokemon tcg','pokemon cards') THEN v_lower := 'pokemon';
      WHEN v_lower IN ('mtg','magic the gathering','magic: the gathering') THEN v_lower := 'magic';
      WHEN v_lower IN ('yugioh','yu-gi-oh','yu-gi-oh!') THEN v_lower := 'yugioh';
      WHEN v_lower IN ('fab','flesh and blood') THEN v_lower := 'fab';
      WHEN v_lower IN ('one piece tcg') THEN v_lower := 'one-piece';
      WHEN v_lower IN ('dragon ball','dragonball','dbs','dragon ball super') THEN v_lower := 'dragonball';
      WHEN v_lower IN ('dbs fusion world','fusion world') THEN v_lower := 'fusion-world';
      WHEN v_lower IN ('star wars unlimited','swu') THEN v_lower := 'star-wars-unlimited';
      WHEN v_lower IN ('wss','weiss schwarz','weiss') THEN v_lower := 'weiss-schwarz';
      WHEN v_lower IN ('cfv','cardfight vanguard','cardfight!! vanguard') THEN v_lower := 'cardfight-vanguard';
      WHEN v_lower IN ('dc comics','dc') THEN v_lower := 'dc-comics';
      WHEN v_lower IN ('marvel comics','marvel') THEN v_lower := 'marvel-comics';
      WHEN v_lower IN ('image comics') THEN v_lower := 'image-comics';
      WHEN v_lower IN ('dark horse','dark horse comics') THEN v_lower := 'dark-horse-comics';
      WHEN v_lower ~ '^grade[\s\-_]*(\d+\.?\d*)$' THEN v_lower := 'grade-' || (regexp_match(v_lower, '(\d+\.?\d*)'))[1];
      WHEN v_lower ~ '^(psa|bgs|cgc|sgc)[\s\-_]*(\d+\.?\d*)$' THEN v_lower := (regexp_match(v_lower, '^(\w+)'))[1] || '-' || (regexp_match(v_lower, '(\d+\.?\d*)$'))[1];
      ELSE NULL;
    END CASE;

    -- Deduplicate
    IF NOT v_lower = ANY(v_norm) THEN
      v_norm := v_norm || v_lower;
    END IF;

    -- Detect category
    IF v_lower IN ('pokemon','magic','yugioh','fab','one-piece','dragonball','fusion-world',
                   'star-wars-unlimited','weiss-schwarz','cardfight-vanguard','digimon',
                   'union-arena','lorcana','panini','metazoo') THEN
      v_cat := v_lower;
    ELSIF v_lower IN ('sports','baseball','basketball','football','hockey','soccer','wrestling','boxing','racing','golf','tennis','mma','ufc') THEN
      v_cat := 'sports';
    ELSIF v_lower IN ('comics','comic','comic-book','dc-comics','marvel-comics','image-comics','dark-horse-comics') THEN
      v_cat := 'comics';
    END IF;

    -- Detect condition
    IF v_lower IN ('graded','psa','bgs','cgc','sgc','beckett','ace') THEN
      v_cond := 'graded';
    ELSIF v_lower IN ('raw','ungraded','near-mint','nm','lp','mp','hp','dmg') THEN
      v_cond := 'raw';
    END IF;
  END LOOP;

  NEW.normalized_tags := v_norm;
  NEW.primary_category := COALESCE(v_cat, NEW.primary_category);
  NEW.condition_type := COALESCE(v_cond, NEW.condition_type);

  RETURN NEW;
END;
$$;

-- Backfill: reset shopify_tags to NULL so the trigger regenerates them with new logic
-- This touches all items, allowing the BEFORE UPDATE trigger to re-fire
UPDATE public.intake_items
SET shopify_tags = NULL, updated_at = now()
WHERE deleted_at IS NULL;
