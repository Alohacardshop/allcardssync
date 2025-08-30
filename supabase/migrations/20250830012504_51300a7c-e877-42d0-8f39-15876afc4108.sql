-- First, create a lot record for the existing item
INSERT INTO public.intake_lots (
  id,
  lot_number,
  lot_type,
  total_items,
  total_value,
  status,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  'LOT-000074',
  'mixed',
  COUNT(*),
  COALESCE(SUM(price * quantity), 0),
  'active',
  MIN(created_at),
  now()
FROM public.intake_items 
WHERE lot_number = 'LOT-000074' AND deleted_at IS NULL;

-- Update the intake_item to reference the new lot
UPDATE public.intake_items 
SET lot_id = (
  SELECT id FROM public.intake_lots WHERE lot_number = 'LOT-000074'
)
WHERE lot_number = 'LOT-000074' AND deleted_at IS NULL;

-- Create a function to automatically create lots when items are added
CREATE OR REPLACE FUNCTION public.ensure_lot_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Check if a lot record exists for this lot_number
  IF NOT EXISTS (
    SELECT 1 FROM public.intake_lots 
    WHERE lot_number = NEW.lot_number
  ) THEN
    -- Create a new lot record
    INSERT INTO public.intake_lots (
      id,
      lot_number,
      lot_type,
      total_items,
      total_value,
      status,
      store_key,
      shopify_location_gid,
      created_by,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      NEW.lot_number,
      'mixed',
      0,  -- Will be updated by update_lot_totals trigger
      0,  -- Will be updated by update_lot_totals trigger
      'active',
      NEW.store_key,
      NEW.shopify_location_gid,
      auth.uid(),
      now(),
      now()
    );
  END IF;
  
  -- Set the lot_id if it's not already set
  IF NEW.lot_id IS NULL THEN
    NEW.lot_id := (
      SELECT id FROM public.intake_lots 
      WHERE lot_number = NEW.lot_number
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to ensure lots exist before inserting/updating items
CREATE TRIGGER ensure_lot_exists_trigger
  BEFORE INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.ensure_lot_exists();