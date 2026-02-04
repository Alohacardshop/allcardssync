-- Add shopify_tags column to intake_items for efficient tag-based filtering
ALTER TABLE intake_items 
ADD COLUMN IF NOT EXISTS shopify_tags TEXT[];

-- Create GIN index for fast array contains queries
CREATE INDEX IF NOT EXISTS idx_intake_items_shopify_tags 
ON intake_items USING GIN (shopify_tags);

-- Backfill existing data from shopify_snapshot
UPDATE intake_items 
SET shopify_tags = ARRAY(
  SELECT jsonb_array_elements_text(shopify_snapshot->'tags')
)
WHERE shopify_snapshot IS NOT NULL 
  AND shopify_snapshot->'tags' IS NOT NULL
  AND (shopify_tags IS NULL OR array_length(shopify_tags, 1) IS NULL);