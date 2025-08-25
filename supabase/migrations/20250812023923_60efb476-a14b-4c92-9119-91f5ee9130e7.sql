-- Soft delete support for intake_items
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
ADD COLUMN IF NOT EXISTS deleted_reason TEXT NULL;

-- Helpful index to filter active items quickly
CREATE INDEX IF NOT EXISTS idx_intake_items_deleted_at ON public.intake_items (deleted_at);