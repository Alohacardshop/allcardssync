-- Drop existing functions to allow return type changes
DROP FUNCTION IF EXISTS public.soft_delete_intake_item(uuid, text);
DROP FUNCTION IF EXISTS public.soft_delete_intake_items(uuid[], text);
DROP FUNCTION IF EXISTS public.restore_intake_item(uuid, text);

-- SINGLE delete -> returns TABLE(id uuid) for stable PostgREST shape
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(
  item_id uuid,
  reason_in text DEFAULT 'soft delete'
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.intake_items
     SET deleted_at = now(),
         deleted_reason = reason_in,
         updated_at = now()
   WHERE id = soft_delete_intake_item.item_id
   RETURNING intake_items.id INTO id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES ('soft_delete', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_intake_item(uuid, text) TO authenticated;

-- BULK delete -> returns jsonb {deleted_count}
CREATE OR REPLACE FUNCTION public.soft_delete_intake_items(
  ids uuid[],
  reason text DEFAULT 'bulk soft delete'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
  v_count int;
BEGIN
  UPDATE public.intake_items
     SET deleted_at = now(),
         deleted_reason = reason,
         updated_at = now()
   WHERE id = ANY(ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  SELECT 'soft_delete_bulk', 'intake_items', x, jsonb_build_object('reason', reason, 'at', now())
  FROM unnest(ids) AS x;

  RETURN jsonb_build_object('deleted_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_intake_items(uuid[], text) TO authenticated;

-- RESTORE -> returns TABLE(id uuid)
CREATE OR REPLACE FUNCTION public.restore_intake_item(
  item_id uuid,
  reason_in text DEFAULT 'restore'
)
RETURNS TABLE (id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.intake_items
     SET deleted_at = null,
         deleted_reason = null,
         updated_at = now()
   WHERE id = restore_intake_item.item_id
   RETURNING intake_items.id INTO id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES ('restore', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_intake_item(uuid, text) TO authenticated;