-- Migration: Add updated_by column to intake_items
-- Date: 2025-10-29
-- Purpose: Track which user made updates to intake items
-- Safe to run multiple times (idempotent)

-- Add updated_by column if it doesn't exist
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS updated_by text;

-- Create index for updated_by if it doesn't exist
-- This supports queries filtering or grouping by user who last updated items
CREATE INDEX IF NOT EXISTS idx_intake_items_updated_by 
ON public.intake_items (updated_by);

-- Add comment to document the column
COMMENT ON COLUMN public.intake_items.updated_by IS 
'User ID (as text) of the user who last updated this item. Automatically set by intake_items_audit_updated_by trigger.';

-- Verify the trigger exists (for documentation - does not fail if missing)
-- The trigger should be: intake_items_audit_updated_by
-- Which calls: public.intake_items_audit_updated_by()
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'intake_items_audit_updated_by' 
    AND tgrelid = 'public.intake_items'::regclass
  ) THEN
    RAISE NOTICE 'WARNING: Trigger intake_items_audit_updated_by does not exist. This column will not be automatically populated.';
  ELSE
    RAISE NOTICE 'SUCCESS: Trigger intake_items_audit_updated_by exists and will populate this column.';
  END IF;
END $$;
