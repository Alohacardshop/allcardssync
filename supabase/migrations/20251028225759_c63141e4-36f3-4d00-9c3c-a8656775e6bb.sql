-- Fix validate_item_lot_owner trigger to allow clearing lot_id
-- Only validate ownership when ADDING items to a lot, not when REMOVING them

CREATE OR REPLACE FUNCTION public.validate_item_lot_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Skip validation if clearing lot_id (setting to NULL)
  IF NEW.lot_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip validation if lot_id hasn't changed
  IF OLD.lot_id IS NOT DISTINCT FROM NEW.lot_id THEN
    RETURN NEW;
  END IF;

  -- Validate ownership when adding to a lot
  IF NOT EXISTS (
    SELECT 1 FROM public.intake_lots
    WHERE id = NEW.lot_id
    AND created_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You can only add items to your own lots';
  END IF;

  RETURN NEW;
END;
$$;