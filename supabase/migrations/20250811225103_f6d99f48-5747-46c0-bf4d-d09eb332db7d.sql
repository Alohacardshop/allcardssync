
-- Add a cost column to graded intake items
ALTER TABLE public.intake_items
ADD COLUMN IF NOT EXISTS cost numeric NULL;
