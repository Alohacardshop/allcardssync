
-- Admin-only soft delete for a batch (lot) and its items.
-- Safely marks items deleted and zeros out the lot totals; adds a deletion note.
create or replace function public.admin_delete_batch(
  lot_id_in uuid,
  reason_in text default 'Batch deleted by admin'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_items integer := 0;
begin
  -- Require admin role
  if not has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Access denied: Admin role required';
  end if;

  -- Soft-delete items in the batch
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = coalesce(reason_in, 'Batch deleted by admin'),
         updated_at = now()
   where lot_id = lot_id_in
     and deleted_at is null;

  get diagnostics v_items = row_count;

  -- Mark lot as deleted and zero totals
  update public.intake_lots
     set status = 'deleted',
         notes = coalesce(notes, '') ||
                 case when notes is null or notes = '' then '' else E'\n' end ||
                 ('Deleted at ' || to_char(now(), 'YYYY-MM-DD HH24:MI:SS') ||
                  ' by admin' ||
                  case when reason_in is not null and length(reason_in) > 0
                       then ': ' || reason_in else '' end),
         total_items = 0,
         total_value = 0,
         updated_at = now()
   where id = lot_id_in;

  return v_items;
end;
$$;
