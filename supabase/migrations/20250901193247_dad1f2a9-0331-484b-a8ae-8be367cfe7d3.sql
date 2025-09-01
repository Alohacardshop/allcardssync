
-- 1) Add a durable flag to mark items removed from the current batch view
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS removed_from_batch_at TIMESTAMPTZ NULL;

-- 2) Performance index for batch queries (show visible items in a lot)
CREATE INDEX IF NOT EXISTS idx_intake_items_batch_visible
ON public.intake_items (lot_number, removed_from_batch_at)
WHERE deleted_at IS NULL;

-- 3) Optional backfill: Hide items already marked as sent to inventory via notes
--    (Uncomment if you want to hide past items with that note from Current Batch)
-- UPDATE public.intake_items
-- SET removed_from_batch_at = COALESCE(removed_from_batch_at, updated_at)
-- WHERE deleted_at IS NULL
--   AND removed_from_batch_at IS NULL
--   AND processing_notes ILIKE 'Sent to inventory%';
