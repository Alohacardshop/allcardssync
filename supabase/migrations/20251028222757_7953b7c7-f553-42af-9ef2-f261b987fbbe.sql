-- Auto-clear items from lots after 24 hours of inactivity
-- This prevents items from being stuck in lots indefinitely

-- Function to clear items from stale lots
CREATE OR REPLACE FUNCTION public.clear_stale_lot_items()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clear lot_id from items that have been in a lot for over 24 hours
  -- without being pushed to Shopify or removed from batch
  UPDATE public.intake_items
  SET 
    lot_id = NULL,
    removed_from_batch_at = now()
  WHERE 
    lot_id IS NOT NULL
    AND pushed_at IS NULL
    AND deleted_at IS NULL
    AND (
      -- Items added to lot over 24 hours ago
      created_at < now() - interval '24 hours'
      OR
      -- Items updated over 24 hours ago (covers items re-added to lot)
      updated_at < now() - interval '24 hours'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.clear_stale_lot_items() TO authenticated;

-- Create a helper view to see stale items
CREATE OR REPLACE VIEW public.stale_lot_items AS
SELECT 
  ii.id,
  ii.lot_id,
  ii.sku,
  ii.psa_cert,
  ii.created_at,
  ii.updated_at,
  GREATEST(ii.created_at, ii.updated_at) as last_modified,
  now() - GREATEST(ii.created_at, ii.updated_at) as age
FROM public.intake_items ii
WHERE 
  ii.lot_id IS NOT NULL
  AND ii.pushed_at IS NULL
  AND ii.deleted_at IS NULL
  AND GREATEST(ii.created_at, ii.updated_at) < now() - interval '24 hours';

-- Grant view access to staff/admin
GRANT SELECT ON public.stale_lot_items TO authenticated;