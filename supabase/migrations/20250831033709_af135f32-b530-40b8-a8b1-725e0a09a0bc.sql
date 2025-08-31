-- Add unique item UID and PSA snapshot columns to intake_items table
-- This migration is idempotent and can be run multiple times safely

-- 5a) Unique item UID on each row
ALTER TABLE IF EXISTS public.intake_items
  ADD COLUMN IF NOT EXISTS unique_item_uid uuid NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_intake_items_unique_item_uid ON public.intake_items(unique_item_uid);

-- 5b) PSA snapshot JSONB for full-text-ish search/filter later
ALTER TABLE IF EXISTS public.intake_items
  ADD COLUMN IF NOT EXISTS psa_snapshot jsonb;

-- 5c) Helpful simple columns for search (if not present)
ALTER TABLE IF EXISTS public.intake_items
  ADD COLUMN IF NOT EXISTS psa_cert text,
  ADD COLUMN IF NOT EXISTS brand_title text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS variant text,
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS year text,
  ADD COLUMN IF NOT EXISTS grade text;

-- 5d) JSONB index (GIN) on psa_snapshot for key lookup
CREATE INDEX IF NOT EXISTS idx_intake_items_psa_snapshot ON public.intake_items USING gin (psa_snapshot);

-- Add comment explaining the purpose
COMMENT ON COLUMN public.intake_items.unique_item_uid IS 'Unique identifier for each card item for tracking and recall';
COMMENT ON COLUMN public.intake_items.psa_snapshot IS 'Complete PSA scraping data snapshot for search and analysis';