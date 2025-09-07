
-- 1) Restrict print job deletion to admins only
drop policy if exists "Staff/Admin can delete print_jobs" on public.print_jobs;

create policy "Admins can delete print_jobs"
on public.print_jobs
for delete
to authenticated
using (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Only admins can soft-delete intake items (single item)
create or replace function public.soft_delete_intake_item(item_id uuid, reason_in text default 'soft delete'::text)
returns table(id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Access denied: Admin role required to delete items';
  end if;

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

-- 3) Only admins can soft-delete intake items (bulk)
create or replace function public.soft_delete_intake_items(ids uuid[], reason text default 'bulk soft delete'::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_count int;
begin
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Access denied: Admin role required to delete items';
  end if;

  update public.intake_items
     set deleted_at = now(),
         deleted_reason = reason,
         updated_at = now()
   where id = any(ids);

  get diagnostics v_count = row_count;

  insert into public.audit_log(action, table_name, record_id, new_data)
  select
    'soft_delete_bulk',
    'intake_items',
    x::text,
    jsonb_build_object('reason', reason, 'at', now())
  from unnest(ids) as x;

  return jsonb_build_object('deleted_count', v_count);
end;
$function$;

-- 4) Only admins can delete batches (remove lot-owner override)
create or replace function public.admin_delete_batch(lot_id_in uuid, reason_in text default 'Batch deleted by admin'::text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_items integer := 0;
begin
  -- Admins only
  if not public.has_role(auth.uid(), 'admin'::app_role) then
    raise exception 'Access denied: Admin role required';
  end if;

  -- Soft-delete items in the batch
  update public.intake_items
     set deleted_at = now(),
         deleted_reason = coalesce(reason_in, 'Batch deleted'),
         updated_at = now()
   where lot_id = lot_id_in
     and deleted_at is null;

  get diagnostics v_items = row_count;

  -- Mark lot as deleted and zero totals
  update public.intake_lots
     set status = 'deleted',
         notes = coalesce(notes, '') ||
                 case when coalesce(notes,'') = '' then '' else E'\n' end ||
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
$function$;

-- 5) Guardrails: prevent non-admin soft-deletes via direct updates on intake_items
create or replace function public.prevent_non_admin_soft_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- If attempting to set deleted_at (soft delete)
  if new.deleted_at is not null
     and (old.deleted_at is null or new.deleted_at is distinct from old.deleted_at) then
    if not public.has_role(auth.uid(), 'admin'::app_role) then
      raise exception 'Only admins can delete items';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prevent_non_admin_soft_delete on public.intake_items;
create trigger trg_prevent_non_admin_soft_delete
before update on public.intake_items
for each row
execute function public.prevent_non_admin_soft_delete();

-- 6) Guardrails: prevent non-admin setting intake_lots.status to 'deleted'
create or replace function public.prevent_non_admin_lot_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if (new.status is distinct from old.status)
     and lower(new.status) = 'deleted'
  then
    if not public.has_role(auth.uid(), 'admin'::app_role) then
      raise exception 'Only admins can delete batches';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_prevent_non_admin_lot_delete on public.intake_lots;
create trigger trg_prevent_non_admin_lot_delete
before update on public.intake_lots
for each row
execute function public.prevent_non_admin_lot_delete();
