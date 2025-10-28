-- Create a temporary function with SECURITY DEFINER to bypass RLS triggers
CREATE OR REPLACE FUNCTION public.migration_cleanup_duplicates()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Disable ALL triggers temporarily for this function's scope
  SET session_replication_role = replica;
  
  -- Clean up duplicates
  WITH ranked AS (
    SELECT id, shopify_product_id, created_at, sku,
           ROW_NUMBER() OVER (PARTITION BY shopify_product_id
                              ORDER BY created_at DESC, id DESC) AS rn
    FROM public.intake_items
    WHERE deleted_at IS NULL AND shopify_product_id IS NOT NULL
  ), to_delete AS (
    SELECT id FROM ranked WHERE rn > 1
  )
  UPDATE public.intake_items AS i
  SET deleted_at = now(),
      deleted_reason = 'Duplicate shopify_product_id (pre-index cleanup)',
      updated_at = now(),
      updated_by = 'migration_duplicate_cleanup'
  FROM to_delete d
  WHERE i.id = d.id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  -- Re-enable triggers
  SET session_replication_role = DEFAULT;
  
  RETURN v_deleted_count;
END;
$$;

-- Execute the cleanup
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT public.migration_cleanup_duplicates() INTO v_count;
  RAISE NOTICE 'Cleaned up % duplicate entries', v_count;
  
  -- Verify no duplicates remain
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT shopify_product_id
      FROM public.intake_items
      WHERE deleted_at IS NULL AND shopify_product_id IS NOT NULL
      GROUP BY shopify_product_id
      HAVING COUNT(*) > 1
    ) AS dupes
  ) THEN
    RAISE EXCEPTION 'Duplicates still exist after cleanup';
  END IF;
END $$;

-- Drop the temporary function
DROP FUNCTION public.migration_cleanup_duplicates();

-- Add the partial unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_shopify_product_id
ON public.intake_items (shopify_product_id)
WHERE shopify_product_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON INDEX public.uniq_active_shopify_product_id IS 
'Prevents duplicate shopify_product_id values for active (non-deleted) items';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_sku_per_store
ON public.intake_items (store_key, sku)
WHERE sku IS NOT NULL AND deleted_at IS NULL AND type = 'Raw';

COMMENT ON INDEX public.uniq_active_sku_per_store IS 
'Prevents duplicate SKUs within the same store for active Raw type items';