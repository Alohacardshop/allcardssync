-- Optional trigram search RPC + indexes
BEGIN;

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Create trigram index for fuzzy name search on cards
CREATE INDEX IF NOT EXISTS idx_cards_name_trgm
ON catalog_v2.cards USING gin (name gin_trgm_ops);

-- Create search function with trigram similarity
CREATE OR REPLACE FUNCTION catalog_v2.search_cards(
  game_in text, 
  q text, 
  lim int DEFAULT 20, 
  off int DEFAULT 0
)
RETURNS SETOF catalog_v2.cards
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = catalog_v2, public
AS $$
  SELECT *
  FROM catalog_v2.cards c
  WHERE c.game = game_in
    AND (q IS NULL OR q = '' OR c.name % q OR c.name ILIKE '%' || q || '%')
  ORDER BY 
    CASE WHEN q IS NULL OR q = '' THEN 0 ELSE similarity(c.name, q) END DESC NULLS LAST, 
    c.name ASC
  LIMIT COALESCE(lim, 20) OFFSET COALESCE(off, 0);
$$;

GRANT EXECUTE ON FUNCTION catalog_v2.search_cards(text, text, int, int) TO authenticated;

COMMIT;