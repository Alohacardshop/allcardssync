-- Inventory RPC and Indexes Migration

-- 1) Create audit_log table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial primary key,
  created_at timestamp with time zone default now(),
  action text not null,
  table_name text not null,
  record_id uuid,
  details jsonb
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Policy for audit_log (admin can view all, system can insert)
CREATE POLICY "Admins can view all audit logs" ON public.audit_log
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs" ON public.audit_log
FOR INSERT WITH CHECK (true);

-- 2) Single-item soft delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'soft delete')
RETURNS TABLE (id uuid) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  UPDATE public.intake_items
  SET deleted_at = now(), 
      deleted_reason = reason_in,
      updated_at = now()
  WHERE intake_items.id = item_id
  RETURNING intake_items.id INTO id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, details)
  VALUES ('soft_delete', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_intake_item(uuid, text) FROM public;
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
RETURNS TABLE (id uuid) 
LANGUAGE plpgsql 
SECURITY DEFINER 
AS $$
BEGIN
  UPDATE public.intake_items
  SET deleted_at = null, 
      deleted_reason = null,
      updated_at = now()
  WHERE intake_items.id = item_id
  RETURNING intake_items.id INTO id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, details)
  VALUES ('restore', 'intake_items', item_id, jsonb_build_object('reason', reason_in, 'at', now()));

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_intake_item(uuid, text) TO authenticated;

-- 5) Admin-only lot delete (update existing function to use audit log)
CREATE OR REPLACE FUNCTION public.admin_delete_batch(lot_id_in uuid, reason_in text DEFAULT 'admin lot delete')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_items integer := 0;
BEGIN
  -- Require admin role
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required';
  END IF;

  -- Soft-delete items in the batch
  UPDATE public.intake_items
  SET deleted_at = now(),
      deleted_reason = COALESCE(reason_in, 'Batch deleted by admin'),
      updated_at = now()
  WHERE lot_id = lot_id_in
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_items = ROW_COUNT;

  -- Mark lot as deleted and zero totals
  UPDATE public.intake_lots
  SET status = 'deleted',
      notes = COALESCE(notes, '') ||
              CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE E'\n' END ||
              ('Deleted at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') ||
               ' by admin' ||
               CASE WHEN reason_in IS NOT NULL AND length(reason_in) > 0
                    THEN ': ' || reason_in ELSE '' END),
      total_items = 0,
      total_value = 0,
      updated_at = now()
  WHERE id = lot_id_in;

  -- Log the batch delete
  INSERT INTO public.audit_log(action, table_name, record_id, details)
  VALUES ('admin_lot_delete', 'intake_lots', lot_id_in, jsonb_build_object('affected', v_items, 'reason', reason_in, 'at', now()));

  RETURN v_items;
END;
$$;

-- 6) Indexes for common filters (partial to skip deleted)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_brand_subject_not_deleted 
ON public.intake_items (brand_title, subject) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_lot_not_deleted 
ON public.intake_items (lot_number) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_sku_not_deleted 
ON public.intake_items (sku) 
WHERE deleted_at IS NULL AND sku IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_items_created_at_not_deleted 
ON public.intake_items (created_at DESC) 
WHERE deleted_at IS NULL;