-- Fix search_path for close_empty_batch function
CREATE OR REPLACE FUNCTION public.close_empty_batch(lot_id_in uuid)
RETURNS void AS $$
BEGIN
  UPDATE public.intake_lots 
  SET status = 'closed',
      notes = COALESCE(notes || ' | ', '') || 'Manually closed at ' || now()::text,
      updated_at = now()
  WHERE id = lot_id_in 
    AND status = 'active'
    AND (total_items = 0 OR NOT EXISTS (
      SELECT 1 FROM public.intake_items 
      WHERE lot_id = lot_id_in AND deleted_at IS NULL
    ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;