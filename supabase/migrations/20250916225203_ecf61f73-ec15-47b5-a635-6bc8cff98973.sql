-- Fix ambiguous column reference in soft_delete_intake_item function
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'Deleted from current batch'::text)
 RETURNS TABLE(item_id_out uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_item_id uuid;
BEGIN
  -- Check permissions: admin or batch owner
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_delete_batch_item(item_id)) THEN
    RAISE EXCEPTION 'Access denied: Only admins or the current batch owner can delete items not yet in inventory';
  END IF;

  UPDATE public.intake_items
     SET deleted_at = now(), 
         deleted_reason = reason_in, 
         updated_at = now()
   WHERE intake_items.id = item_id
   RETURNING intake_items.id INTO deleted_item_id;

  IF deleted_item_id IS NULL THEN
    RAISE EXCEPTION 'Item not found or access denied';
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, new_data)
  VALUES (
    'soft_delete',
    'intake_items',
    deleted_item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  item_id_out := deleted_item_id;
  RETURN NEXT;
END;
$function$;