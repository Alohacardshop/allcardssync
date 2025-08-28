-- Add provider_id column to catalog_v2.sets table
ALTER TABLE catalog_v2.sets
ADD COLUMN IF NOT EXISTS provider_id text;

-- Create unique index for provider_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS sets_provider_unique
ON catalog_v2.sets (game, provider_id)
WHERE provider_id IS NOT NULL;