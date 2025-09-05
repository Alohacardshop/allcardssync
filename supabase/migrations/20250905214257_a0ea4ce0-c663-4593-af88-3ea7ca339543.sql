-- Create the missing soft_delete_intake_item function
CREATE OR REPLACE FUNCTION public.soft_delete_intake_item(item_id uuid, reason_in text DEFAULT 'soft delete'::text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
begin
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = reason_in,
         updated_at = now()
   where id = soft_delete_intake_item.item_id
   returning intake_items.id into id;

  if not found then
    raise exception 'Item not found or access denied';
  end if;

  insert into public.audit_log(action, table_name, record_id, new_data)
  values (
    'soft_delete',
    'intake_items',
    item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  return next;
end;
$function$;