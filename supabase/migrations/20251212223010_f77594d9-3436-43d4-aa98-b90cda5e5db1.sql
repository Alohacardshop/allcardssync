-- Backfill orphaned intake_items with lot_id based on matching store/location/user
-- This fixes items that were created before the lot_id assignment was properly implemented

UPDATE public.intake_items i
SET 
  lot_id = l.id, 
  lot_number = l.lot_number,
  updated_at = now()
FROM public.intake_lots l
WHERE i.lot_id IS NULL
  AND i.deleted_at IS NULL
  AND i.removed_from_batch_at IS NULL
  AND i.store_key = l.store_key
  AND i.shopify_location_gid = l.shopify_location_gid
  AND i.created_by = l.created_by
  AND l.status = 'active';

-- Log the backfill operation
INSERT INTO public.system_logs (level, message, context)
SELECT 
  'info',
  'Backfilled orphaned items with lot_id',
  jsonb_build_object(
    'affected_rows', (SELECT COUNT(*) FROM public.intake_items WHERE lot_id IS NOT NULL AND updated_at > now() - interval '5 seconds')
  );