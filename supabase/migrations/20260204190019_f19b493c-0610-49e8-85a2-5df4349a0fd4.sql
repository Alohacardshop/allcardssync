-- Fix: Update normalization function to be more precise about grade detection
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
    -- Grading companies (must have "psa", "cgc", "bgs" prefix to detect grade)
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
    -- Grade level normalization - ONLY match explicit patterns with prefix
    -- e.g., "psa-10", "psa 10", "cgc-9.8", "grade-10" but NOT just "10" or "702"
    ELSIF lower_tag ~ '^(psa|cgc|bgs|grade)[- ]?\d+(\.\d+)?$' THEN
      normalized := array_append(normalized, 'graded');
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
    ELSIF lower_tag = 'tcg' OR lower_tag = 'tcg-cards' THEN
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

-- Re-run backfill with updated function
UPDATE public.intake_items 
SET updated_at = updated_at 
WHERE shopify_tags IS NOT NULL AND array_length(shopify_tags, 1) > 0;