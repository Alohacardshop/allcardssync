-- Add normalized tag columns to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS normalized_tags TEXT[],
ADD COLUMN IF NOT EXISTS primary_category TEXT,
ADD COLUMN IF NOT EXISTS condition_type TEXT;

-- Create index for faster tag-based filtering
CREATE INDEX IF NOT EXISTS idx_intake_items_normalized_tags ON public.intake_items USING GIN (normalized_tags);
CREATE INDEX IF NOT EXISTS idx_intake_items_primary_category ON public.intake_items (primary_category);
CREATE INDEX IF NOT EXISTS idx_intake_items_condition_type ON public.intake_items (condition_type);

-- Create normalization function for Shopify tags
CREATE OR REPLACE FUNCTION public.normalize_shopify_tags(raw_tags TEXT[])
RETURNS TEXT[] AS $$
DECLARE
  normalized TEXT[] := '{}';
  tag TEXT;
  lower_tag TEXT;
BEGIN
  IF raw_tags IS NULL THEN
    RETURN '{}';
  END IF;
  
  FOREACH tag IN ARRAY raw_tags LOOP
    -- Lowercase and trim
    lower_tag := lower(trim(tag));
    
    -- Skip empty tags
    IF lower_tag = '' THEN
      CONTINUE;
    END IF;
    
    -- Pokemon normalization
    IF lower_tag IN ('pokemon', 'pokémon', 'poke', 'pkmn') THEN
      normalized := array_append(normalized, 'pokemon');
    -- Sports normalization  
    ELSIF lower_tag IN ('sports', 'sportscards', 'sports cards', 'trading cards sports') THEN
      normalized := array_append(normalized, 'sports');
    -- Baseball
    ELSIF lower_tag IN ('baseball', 'baseball cards', 'mlb') THEN
      normalized := array_append(normalized, 'sports');
      normalized := array_append(normalized, 'baseball');
    -- Basketball
    ELSIF lower_tag IN ('basketball', 'basketball cards', 'nba') THEN
      normalized := array_append(normalized, 'sports');
      normalized := array_append(normalized, 'basketball');
    -- Football  
    ELSIF lower_tag IN ('football', 'football cards', 'nfl') THEN
      normalized := array_append(normalized, 'sports');
      normalized := array_append(normalized, 'football');
    -- Comics
    ELSIF lower_tag IN ('comics', 'comic', 'comic book', 'comic books') THEN
      normalized := array_append(normalized, 'comics');
    -- Grading companies
    ELSIF lower_tag IN ('psa', 'psa graded') THEN
      normalized := array_append(normalized, 'graded');
      normalized := array_append(normalized, 'psa');
    ELSIF lower_tag IN ('cgc', 'cgc graded') THEN
      normalized := array_append(normalized, 'graded');
      normalized := array_append(normalized, 'cgc');
    ELSIF lower_tag IN ('bgs', 'bgs graded', 'beckett') THEN
      normalized := array_append(normalized, 'graded');
      normalized := array_append(normalized, 'bgs');
    ELSIF lower_tag = 'graded' THEN
      normalized := array_append(normalized, 'graded');
    -- Grade level normalization (grade10, psa-10, grade-10, 10 → grade-10)
    ELSIF lower_tag ~ '^(grade|psa|cgc|bgs)?-?\s*\d+(\.\d+)?$' THEN
      normalized := array_append(normalized, 'grade-' || regexp_replace(lower_tag, '[^\d.]', '', 'g'));
    -- Sealed products
    ELSIF lower_tag IN ('sealed', 'sealed product', 'factory sealed') THEN
      normalized := array_append(normalized, 'sealed');
    -- Raw items
    ELSIF lower_tag IN ('raw', 'ungraded') THEN
      normalized := array_append(normalized, 'raw');
    -- TCG Games
    ELSIF lower_tag IN ('yugioh', 'yu-gi-oh', 'yu-gi-oh!') THEN
      normalized := array_append(normalized, 'tcg');
      normalized := array_append(normalized, 'yugioh');
    ELSIF lower_tag IN ('magic', 'mtg', 'magic the gathering') THEN
      normalized := array_append(normalized, 'tcg');
      normalized := array_append(normalized, 'mtg');
    ELSIF lower_tag IN ('one piece', 'onepiece') THEN
      normalized := array_append(normalized, 'tcg');
      normalized := array_append(normalized, 'one-piece');
    ELSIF lower_tag = 'tcg' THEN
      normalized := array_append(normalized, 'tcg');
    -- Keep other tags as-is (lowercased)
    ELSE
      normalized := array_append(normalized, lower_tag);
    END IF;
  END LOOP;
  
  -- Return unique tags
  RETURN ARRAY(SELECT DISTINCT unnest(normalized) ORDER BY 1);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Create trigger function to auto-normalize tags
CREATE OR REPLACE FUNCTION public.trigger_normalize_tags()
RETURNS TRIGGER AS $$
BEGIN
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

-- Create trigger (drop first if exists to avoid conflicts)
DROP TRIGGER IF EXISTS intake_items_normalize_tags ON public.intake_items;
CREATE TRIGGER intake_items_normalize_tags
BEFORE INSERT OR UPDATE ON public.intake_items
FOR EACH ROW EXECUTE FUNCTION public.trigger_normalize_tags();

-- Backfill existing data - run UPDATE to trigger the normalization
UPDATE public.intake_items 
SET updated_at = updated_at 
WHERE shopify_tags IS NOT NULL AND array_length(shopify_tags, 1) > 0;