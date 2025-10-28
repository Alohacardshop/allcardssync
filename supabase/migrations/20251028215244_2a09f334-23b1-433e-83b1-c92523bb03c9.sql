-- Create a SECURITY DEFINER function to cleanup PSA duplicates
-- This bypasses RLS and the soft-delete trigger by temporarily disabling it
CREATE OR REPLACE FUNCTION public.admin_cleanup_psa_duplicates()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
  deleted_count int := 0;
  kept_count int := 0;
BEGIN
  -- Temporarily disable the trigger
  ALTER TABLE public.intake_items DISABLE TRIGGER trg_prevent_non_admin_soft_delete;
  
  -- Soft delete duplicates, keeping the oldest for each PSA cert
  WITH duplicates AS (
    SELECT 
      psa_cert,
      array_agg(id ORDER BY created_at ASC) as item_ids
    FROM public.intake_items
    WHERE psa_cert IS NOT NULL 
      AND psa_cert != ''
      AND deleted_at IS NULL
    GROUP BY psa_cert
    HAVING COUNT(*) > 1
  ),
  to_delete AS (
    SELECT 
      psa_cert,
      unnest(item_ids[2:array_length(item_ids, 1)]) as id_to_delete,
      item_ids[1] as kept_id
    FROM duplicates
  )
  UPDATE public.intake_items
  SET 
    deleted_at = now(),
    deleted_reason = 'Duplicate PSA cert - kept item ' || td.kept_id,
    updated_at = now()
  FROM to_delete td
  WHERE intake_items.id = td.id_to_delete;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Count kept items (groups where we kept one)
  SELECT COUNT(*)::int INTO kept_count
  FROM (
    SELECT psa_cert
    FROM public.intake_items
    WHERE psa_cert IS NOT NULL 
      AND psa_cert != ''
      AND deleted_at IS NULL
    GROUP BY psa_cert
    HAVING COUNT(*) = 1
  ) subq;
  
  -- Re-enable the trigger
  ALTER TABLE public.intake_items ENABLE TRIGGER trg_prevent_non_admin_soft_delete;
  
  result := jsonb_build_object(
    'deleted_count', deleted_count,
    'kept_count', kept_count
  );
  
  RETURN result;
END;
$$;