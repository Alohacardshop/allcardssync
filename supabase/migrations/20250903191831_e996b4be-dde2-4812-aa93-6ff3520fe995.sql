-- Inventory RPC and Indexes Migration (v4)

-- Drop and recreate functions to handle signature changes
DROP FUNCTION IF EXISTS public.soft_delete_intake_item(uuid, text);
DROP FUNCTION IF EXISTS public.soft_delete_intake_items(uuid[], text);  
DROP FUNCTION IF EXISTS public.restore_intake_item(uuid, text);

-- 2) Single-item soft delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'soft delete')
RETURNS intake_items
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  v_row public.intake_items%rowtype;
BEGIN
  UPDATE public.intake_items
  SET deleted_at = now(), 
      deleted_reason = reason_in,
      updated_at = now()
  WHERE intake_items.id = item_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, details)
  VALUES ('soft_delete', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_intake_item(uuid, text) TO authenticated;

-- 3) Batch soft delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_intake_items(ids uuid[], reason text DEFAULT 'bulk soft delete')
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.intake_items i
  SET deleted_at = now(), 
      deleted_reason = reason,
      updated_at = now()
  WHERE i.id = ANY(ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_log(action, table_name, record_id, details)
  SELECT 'soft_delete_bulk', 'intake_items', unnest(ids), jsonb_build_object('reason', reason, 'at', now());

  RETURN jsonb_build_object('deleted_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_intake_items(uuid[], text) TO authenticated;

-- 4) Restore (Undo) RPC
CREATE OR REPLACE FUNCTION public.restore_intake_item(item_id uuid, reason_in text DEFAULT 'restore')
RETURNS intake_items
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
DECLARE
  v_row public.intake_items%rowtype;
BEGIN
  UPDATE public.intake_items
  SET deleted_at = null, 
      deleted_reason = null,
      updated_at = now()
  WHERE intake_items.id = item_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, details)
  VALUES ('restore', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_intake_item(uuid, text) TO authenticated;

-- 6) Indexes for common filters (without CONCURRENTLY)
CREATE INDEX IF NOT EXISTS idx_items_brand_subject_not_deleted 
ON public.intake_items (brand_title, subject) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_lot_not_deleted 
ON public.intake_items (lot_number) 
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_items_sku_not_deleted 
ON public.intake_items (sku) 
WHERE deleted_at IS NULL AND sku IS NOT NULL;