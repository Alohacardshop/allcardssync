-- Data integrity indexes and constraints on catalog_v2.cards
BEGIN;

-- Prevent duplicate numbers within the same set + game (but allow nulls)
-- First check if constraint exists, then add if it doesn't
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'cards_game_set_number_uniq' 
    AND table_name = 'cards' 
    AND table_schema = 'catalog_v2'
  ) THEN
    ALTER TABLE catalog_v2.cards
      ADD CONSTRAINT cards_game_set_number_uniq
      UNIQUE (game, set_id, number);
  END IF;
END
$$;

-- Helpful indexes for performance
CREATE INDEX IF NOT EXISTS cards_game_set_idx ON catalog_v2.cards(game, set_id);
CREATE INDEX IF NOT EXISTS cards_tcgplayer_idx ON catalog_v2.cards(tcgplayer_product_id) WHERE tcgplayer_product_id IS NOT NULL;

COMMIT;