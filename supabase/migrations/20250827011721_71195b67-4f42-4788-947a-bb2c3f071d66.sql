-- Data integrity indexes and constraints on catalog_v2.cards
BEGIN;

-- Prevent duplicate numbers within the same set + game (but allow nulls)
ALTER TABLE catalog_v2.cards
  ADD CONSTRAINT IF NOT EXISTS cards_game_set_number_uniq
  UNIQUE (game, set_id, number);

-- Helpful indexes for performance
CREATE INDEX IF NOT EXISTS cards_game_set_idx ON catalog_v2.cards(game, set_id);
CREATE INDEX IF NOT EXISTS cards_tcgplayer_idx ON catalog_v2.cards(tcgplayer_product_id) WHERE tcgplayer_product_id IS NOT NULL;

COMMIT;