-- Allow batch-owner delete, keep inventory delete admin-only

-- Helper function to check if user can delete from their current active batch
CREATE OR REPLACE FUNCTION public.can_delete_batch_item(_item_id uuid)
RETURNS boolean 
LANGUAGE sql 
STABLE 
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.intake_items i
    JOIN public.intake_lots l ON l.id = i.lot_id
    WHERE i.id = _item_id
      AND i.removed_from_batch_at IS NULL  -- not in inventory yet
      AND l.status = 'active'              -- current batch
      AND l.created_by = auth.uid()        -- batch owner
  );
$$;

-- Update the guardrail trigger to allow batch owners to delete from current batch
CREATE OR REPLACE FUNCTION public.prevent_non_admin_soft_delete()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public' 
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL
     AND (OLD.deleted_at IS NULL OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN
    -- Admins can always delete
    IF public.has_role(auth.uid(), 'admin'::app_role) THEN
      RETURN NEW;
    END IF;
    -- Batch owners can delete from their current active batch
    IF public.can_delete_batch_item(COALESCE(NEW.id, OLD.id)) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Only admins or the current batch owner can delete items not yet in inventory';
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_prevent_non_admin_soft_delete ON public.intake_items;
CREATE TRIGGER trg_prevent_non_admin_soft_delete
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_soft_delete();

-- Update the RPC to honor the new rules
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'Deleted from current batch')
RETURNS TABLE(id uuid)
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = 'public' 
AS $$
BEGIN
  -- Check permissions: admin or batch owner
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_delete_batch_item(item_id)) THEN
    RAISE EXCEPTION 'Access denied: Only admins or the current batch owner can delete items not yet in inventory';
  END IF;

  UPDATE public.intake_items
     SET deleted_at = now(), 
         deleted_reason = reason_in, 
         updated_at = now()
   WHERE id = item_id
   RETURNING intake_items.id INTO id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES (
    'soft_delete',
    'intake_items',
    item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  RETURN NEXT;
END;
$$;