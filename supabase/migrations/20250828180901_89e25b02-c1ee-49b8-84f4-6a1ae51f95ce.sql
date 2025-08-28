-- Add indexes and constraints for unified JustTCG sync (without duplicate primary keys)

-- Indexes for performance (safe to run multiple times)
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_game ON catalog_v2.sets(game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_set ON catalog_v2.cards(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_game_set ON catalog_v2.variants(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_card ON catalog_v2.variants(card_id, game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_last_synced ON catalog_v2.sets(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_price ON catalog_v2.variants(price) WHERE price IS NOT NULL;

-- Add analytics column for future 90-day price tracking
ALTER TABLE catalog_v2.variants ADD COLUMN IF NOT EXISTS analytics_90d JSONB;

-- Add foreign key constraints (check if they exist first)
DO $$
BEGIN
  -- Add foreign key from cards to sets if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'catalog_v2_cards_set_fk' 
    AND table_schema = 'catalog_v2' 
    AND table_name = 'cards'
  ) THEN
    ALTER TABLE catalog_v2.cards
      ADD CONSTRAINT catalog_v2_cards_set_fk 
      FOREIGN KEY (set_id, game) REFERENCES catalog_v2.sets (set_id, game) ON DELETE CASCADE;
  END IF;
  
  -- Add foreign key from variants to cards if it doesn't exist  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'catalog_v2_variants_card_fk' 
    AND table_schema = 'catalog_v2' 
    AND table_name = 'variants'
  ) THEN
    ALTER TABLE catalog_v2.variants
      ADD CONSTRAINT catalog_v2_variants_card_fk 
      FOREIGN KEY (card_id, game) REFERENCES catalog_v2.cards (card_id, game) ON DELETE CASCADE;
  END IF;
END $$;