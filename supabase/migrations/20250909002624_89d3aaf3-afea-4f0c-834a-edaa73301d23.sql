-- Add CGC support to intake_items table
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS grading_company TEXT NOT NULL DEFAULT 'PSA',
ADD COLUMN IF NOT EXISTS cgc_cert TEXT,
ADD COLUMN IF NOT EXISTS cgc_snapshot JSONB;

-- Add index for CGC cert lookups
CREATE INDEX IF NOT EXISTS idx_intake_items_cgc_cert ON public.intake_items(cgc_cert) WHERE cgc_cert IS NOT NULL;

-- Add index for grading company
CREATE INDEX IF NOT EXISTS idx_intake_items_grading_company ON public.intake_items(grading_company);