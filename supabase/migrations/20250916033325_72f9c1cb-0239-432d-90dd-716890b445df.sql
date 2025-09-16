-- Fix the validate_item_lot_owner trigger to allow NULL during cleanup operations
CREATE OR REPLACE FUNCTION public.validate_item_lot_owner()
RETURNS TRIGGER AS $$
DECLARE
  lot_owner uuid;
BEGIN
  -- Skip if no lot_id
  IF NEW.lot_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow setting created_by to NULL during cleanup (user deletion)
  IF NEW.created_by IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get lot owner
  SELECT created_by INTO lot_owner
  FROM public.intake_lots
  WHERE id = NEW.lot_id;

  -- Validate ownership match
  IF lot_owner IS DISTINCT FROM NEW.created_by THEN
    RAISE EXCEPTION 'Item created_by must match lot created_by';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;