-- Catalog v2 constraints and indexes for unified JustTCG sync
-- PKs / uniques (only add if they don't exist)
DO $$ 
BEGIN
  -- Primary keys for catalog_v2 tables
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_v2_sets_pkey') THEN
    ALTER TABLE catalog_v2.sets ADD CONSTRAINT catalog_v2_sets_pkey PRIMARY KEY (set_id, game);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_v2_cards_pkey') THEN
    ALTER TABLE catalog_v2.cards ADD CONSTRAINT catalog_v2_cards_pkey PRIMARY KEY (card_id, game);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_v2_variants_pkey') THEN
    ALTER TABLE catalog_v2.variants ADD CONSTRAINT catalog_v2_variants_pkey PRIMARY KEY (variant_key);
  END IF;
END $$;

-- FKs (only add if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_v2_cards_set_fk') THEN
    ALTER TABLE catalog_v2.cards
      ADD CONSTRAINT catalog_v2_cards_set_fk 
      FOREIGN KEY (set_id, game) REFERENCES catalog_v2.sets (set_id, game) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'catalog_v2_variants_card_fk') THEN
    ALTER TABLE catalog_v2.variants
      ADD CONSTRAINT catalog_v2_variants_card_fk 
      FOREIGN KEY (card_id, game) REFERENCES catalog_v2.cards (card_id, game) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_game ON catalog_v2.sets(game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_set ON catalog_v2.cards(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_game_set ON catalog_v2.variants(game, set_id);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_card ON catalog_v2.variants(card_id, game);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_last_synced ON catalog_v2.sets(last_synced_at);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_variants_price ON catalog_v2.variants(price) WHERE price IS NOT NULL;

-- Optional: Add analytics_90d JSONB column for future use
ALTER TABLE catalog_v2.variants ADD COLUMN IF NOT EXISTS analytics_90d JSONB;