-- Backfill main_category for existing items - bypassing trigger by matching created_by
-- This is a safe backfill operation that only updates the main_category field

-- Update main_category for TCG items
UPDATE intake_items ii
SET main_category = 'tcg'
FROM intake_lots il
WHERE ii.lot_id = il.id
AND ii.created_by = il.created_by
AND ii.category IN ('Pokemon', 'TCG Cards', 'Magic the Gathering', 'Yu-Gi-Oh!', 'Digimon', 'Flesh and Blood', 'One Piece', 'Dragon Ball', 'Lorcana', 'Disney Lorcana', 'Star Wars', 'Weiss Schwarz', 'Cardfight Vanguard', 'Final Fantasy')
AND ii.main_category IS NULL
AND ii.deleted_at IS NULL;

-- Update main_category for Sports items
UPDATE intake_items ii
SET main_category = 'sports'
FROM intake_lots il
WHERE ii.lot_id = il.id
AND ii.created_by = il.created_by
AND ii.category IN ('BASEBALL CARDS', 'BASKETBALL CARDS', 'FOOTBALL CARDS', 'MULTI-SPORT CARDS', 'HOCKEY CARDS', 'Baseball', 'Basketball', 'Football', 'Hockey', 'Soccer', 'Golf', 'Tennis', 'Boxing', 'MMA', 'UFC', 'NASCAR', 'Wrestling', 'WWE')
AND ii.main_category IS NULL
AND ii.deleted_at IS NULL;

-- Update main_category for Comics items
UPDATE intake_items ii
SET main_category = 'comics'
FROM intake_lots il
WHERE ii.lot_id = il.id
AND ii.created_by = il.created_by
AND ii.category IN ('Comics', 'Comic Books', 'Graphic Novels', 'Marvel', 'DC', 'DC Comics', 'Image', 'Dark Horse', 'IDW', 'Boom', 'Dynamite', 'Valiant')
AND ii.main_category IS NULL
AND ii.deleted_at IS NULL;

-- For remaining items without lot_id or as fallback, detect from brand_title
UPDATE intake_items ii
SET main_category = CASE
  WHEN LOWER(COALESCE(ii.brand_title, '')) SIMILAR TO '%(pokemon|magic|yugioh|yu-gi-oh|digimon|flesh|one piece|dragon ball|lorcana|star wars|weiss|cardfight|final fantasy|mtg)%' THEN 'tcg'
  WHEN LOWER(COALESCE(ii.brand_title, '')) SIMILAR TO '%(baseball|basketball|football|hockey|soccer|golf|tennis|boxing|mma|ufc|nascar|wrestling|wwe|yankees|dodgers|lakers|celtics|patriots|cowboys)%' THEN 'sports'
  WHEN LOWER(COALESCE(ii.brand_title, '')) SIMILAR TO '%(marvel|dc|comic|batman|superman|spider-man|x-men)%' THEN 'comics'
  ELSE 'tcg'
END
FROM intake_lots il
WHERE ii.lot_id = il.id
AND ii.created_by = il.created_by
AND ii.main_category IS NULL
AND ii.deleted_at IS NULL;