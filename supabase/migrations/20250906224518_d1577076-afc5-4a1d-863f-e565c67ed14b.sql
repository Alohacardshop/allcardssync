-- Drop the existing search_cards function
DROP FUNCTION IF EXISTS search_cards(text, text, integer, integer);

-- Create updated search_cards function that uses the correct table with data
CREATE OR REPLACE FUNCTION search_cards(
    game_in text DEFAULT 'pokemon',
    q text DEFAULT '',
    lim integer DEFAULT 20,
    off integer DEFAULT 0
)
RETURNS TABLE (
    id text,
    name text,
    set_name text,
    game_name text,
    number text,
    rarity text,
    image_url text,
    rank real
)
LANGUAGE sql
AS $$
  SELECT 
    c.card_id as id,
    c.data->>'name' as name,
    c.data->>'set' as set_name,
    c.data->>'game' as game_name,
    c.data->>'number' as number,
    c.data->>'rarity' as rarity,
    null::text as image_url, -- Image URL not available in current schema
    CASE 
      WHEN q IS NULL OR q = '' THEN 0 
      ELSE similarity(c.data->>'name', q) 
    END as rank
  FROM catalog_v2.cards_old_20250829 c
  WHERE 
    (game_in IS NULL OR game_in = '' OR LOWER(c.data->>'game') = LOWER(game_in))
    AND (q IS NULL OR q = '' OR 
         c.data->>'name' ILIKE '%' || q || '%' OR
         c.data->>'set' ILIKE '%' || q || '%' OR
         c.data->>'number' ILIKE '%' || q || '%')
  ORDER BY 
    CASE WHEN q IS NULL OR q = '' THEN 0 ELSE similarity(c.data->>'name', q) END DESC NULLS LAST, 
    c.data->>'name' ASC
  LIMIT COALESCE(lim, 20) OFFSET COALESCE(off, 0);
$$;