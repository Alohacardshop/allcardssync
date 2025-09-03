
-- Fix audit logging to use existing 'new_data' column instead of non-existent 'details'

-- 1) Single-item soft delete
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'soft delete')
RETURNS intake_items
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
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

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES ('soft_delete', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN v_row;
END;
$$;

-- 2) Bulk soft delete
CREATE OR REPLACE FUNCTION public.soft_delete_intake_items(ids uuid[], reason text DEFAULT 'bulk soft delete')
RETURNS jsonb 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
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

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  SELECT 'soft_delete_bulk', 'intake_items', unnest(ids), jsonb_build_object('reason', reason, 'at', now());

  RETURN jsonb_build_object('deleted_count', v_count);
END;
$$;

-- 3) Restore item
CREATE OR REPLACE FUNCTION public.restore_intake_item(item_id uuid, reason_in text DEFAULT 'restore')
RETURNS intake_items
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
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

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES ('restore', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN v_row;
END;
$$;
