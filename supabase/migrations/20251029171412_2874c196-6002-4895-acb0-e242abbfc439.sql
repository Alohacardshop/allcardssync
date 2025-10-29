-- Fix send_intake_item_to_inventory (singular) to match the plural version
-- Add updated_by field and SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.send_intake_item_to_inventory(item_id uuid)
RETURNS intake_items
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.intake_items%rowtype;
BEGIN
  -- Update the item with all required fields including updated_by
  UPDATE public.intake_items
  SET 
    processing_notes = coalesce(processing_notes, ''),
    removed_from_batch_at = now(),
    price = coalesce(price, 0),
    cost = coalesce(cost, cost),
    updated_at = now(),
    updated_by = auth.uid()::text  -- ADD THIS to satisfy triggers
  WHERE id = item_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or you do not have access';
  END IF;

  RETURN v_row;
END;
$function$;