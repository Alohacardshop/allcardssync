-- Step 0: Safety snapshot - rename existing tables to _old_20250829
ALTER TABLE IF EXISTS catalog_v2.sets RENAME TO sets_old_20250829;
ALTER TABLE IF EXISTS catalog_v2.cards RENAME TO cards_old_20250829; 
ALTER TABLE IF EXISTS catalog_v2.variants RENAME TO variants_old_20250829;
ALTER TABLE IF EXISTS catalog_v2.sync_errors RENAME TO sync_errors_old_20250829;
ALTER TABLE IF EXISTS catalog_v2.import_jobs RENAME TO import_jobs_old_20250829;
ALTER TABLE IF EXISTS catalog_v2.pending_sets RENAME TO pending_sets_old_20250829;

-- Step 1: Create minimal catalog_v2 schema with live and shadow tables

-- LIVE TABLES (minimal contract)
CREATE TABLE catalog_v2.sets (
  set_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game          text NOT NULL,
  provider_id   text UNIQUE,
  code          text,
  name          text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_v2.cards (
  card_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game              text NOT NULL,
  provider_id       text UNIQUE,
  set_provider_id   text NOT NULL,
  name              text NOT NULL,
  number            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_v2.variants (
  variant_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game              text NOT NULL,
  provider_id       text UNIQUE,
  card_provider_id  text NOT NULL,
  sku               text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX sets_game_idx ON catalog_v2.sets (game);
CREATE INDEX cards_game_idx ON catalog_v2.cards (game);
CREATE INDEX variants_game_idx ON catalog_v2.variants (game);
CREATE INDEX cards_set_provider_idx ON catalog_v2.cards (set_provider_id);
CREATE INDEX variants_card_provider_idx ON catalog_v2.variants (card_provider_id);

-- SHADOW TABLES (same structure for staging)
CREATE TABLE catalog_v2.sets_new (LIKE catalog_v2.sets INCLUDING ALL);
CREATE TABLE catalog_v2.cards_new (LIKE catalog_v2.cards INCLUDING ALL);
CREATE TABLE catalog_v2.variants_new (LIKE catalog_v2.variants INCLUDING ALL);

-- Keep sync_errors table for logging (not part of the rebuild but needed for operations)
CREATE TABLE catalog_v2.sync_errors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    text NOT NULL DEFAULT 'justtcg',
  game        text NOT NULL,
  set_id      text,
  card_id     text,
  step        text NOT NULL,
  message     text NOT NULL,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sync_errors_game_idx ON catalog_v2.sync_errors (game);
CREATE INDEX sync_errors_created_at_idx ON catalog_v2.sync_errors (created_at DESC);

-- Stats view for compatibility with existing Admin UI (fixed ambiguous column reference)
CREATE OR REPLACE VIEW catalog_v2.stats AS
SELECT 
  s.game,
  count(DISTINCT s.set_id) as sets_count,
  count(DISTINCT c.card_id) as cards_count,
  0 as pending_count
FROM catalog_v2.sets s
LEFT JOIN catalog_v2.cards c ON c.set_provider_id = s.provider_id AND c.game = s.game
GROUP BY s.game;