-- Drop existing function and recreate with integer return type
DROP FUNCTION IF EXISTS public.close_empty_batch(uuid);

CREATE FUNCTION public.close_empty_batch(lot_id_in uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rows_affected integer := 0;
BEGIN
  -- Verify the lot exists and is active with 0 items
  IF NOT EXISTS (
    SELECT 1 FROM intake_lots 
    WHERE id = lot_id_in 
    AND status = 'active'
    AND (total_items = 0 OR total_items IS NULL)
  ) THEN
    RAISE EXCEPTION 'Lot must be active and empty to close';
  END IF;

  -- Update the lot status to closed
  UPDATE intake_lots
  SET 
    status = 'closed',
    updated_at = now()
  WHERE id = lot_id_in
  AND status = 'active';
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  
  RETURN rows_affected;
END;
$$;