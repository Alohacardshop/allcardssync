-- Add vendor column to intake_items table
ALTER TABLE public.intake_items ADD COLUMN IF NOT EXISTS vendor text;

-- Add index for vendor lookups
CREATE INDEX IF NOT EXISTS idx_intake_items_vendor ON public.intake_items(vendor);