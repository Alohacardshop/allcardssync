
-- Add status tracking columns for batch items
ALTER TABLE public.intake_items
  ADD COLUMN IF NOT EXISTS printed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS pushed_at timestamptz NULL;

-- Helpful indexes for filtering/ordering
CREATE INDEX IF NOT EXISTS idx_intake_items_printed_at ON public.intake_items (printed_at);
CREATE INDEX IF NOT EXISTS idx_intake_items_pushed_at ON public.intake_items (pushed_at);
