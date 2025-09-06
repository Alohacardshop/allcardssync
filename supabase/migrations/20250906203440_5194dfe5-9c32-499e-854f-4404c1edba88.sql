-- Drop unique constraint on lot_number so multiple items can share the same lot
ALTER TABLE public.intake_items DROP CONSTRAINT IF EXISTS intake_items_lot_number_key;

-- Add a non-unique index on lot_number for performance
CREATE INDEX IF NOT EXISTS idx_intake_items_lot_number ON public.intake_items (lot_number);