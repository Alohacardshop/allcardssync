
-- Drop existing functions to allow return-type changes
drop function if exists public.soft_delete_intake_item(uuid, text);
drop function if exists public.soft_delete_intake_items(uuid[], text);
drop function if exists public.restore_intake_item(uuid, text);

-- SINGLE delete -> stable: TABLE(id uuid)
create or replace function public.soft_delete_intake_item(
  item_id uuid,
  reason_in text default 'soft delete'
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- Ensure execution rights are explicit
revoke all on function public.soft_delete_intake_item(uuid, text) from public;
grant execute on function public.soft_delete_intake_item(uuid, text) to authenticated;

-- BULK delete -> returns jsonb {deleted_count}
create or replace function public.soft_delete_intake_items(
  ids uuid[],
  reason text default 'bulk soft delete'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
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
$$;

revoke all on function public.soft_delete_intake_items(uuid[], text) from public;
grant execute on function public.soft_delete_intake_items(uuid[], text) to authenticated;

-- RESTORE (Undo) -> stable: TABLE(id uuid)
create or replace function public.restore_intake_item(
  item_id uuid,
  reason_in text default 'restore'
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.intake_items
     set deleted_at = null,
         deleted_reason = null,
         updated_at = now()
   where id = restore_intake_item.item_id
   returning intake_items.id into id;

  if not found then
    raise exception 'Item not found or access denied';
  end if;

  insert into public.audit_log(action, table_name, record_id, new_data)
  values (
    'restore',
    'intake_items',
    item_id::text,
    jsonb_build_object('reason', reason_in, 'at', now())
  );

  return next;
end;
$$;

revoke all on function public.restore_intake_item(uuid, text) from public;
grant execute on function public.restore_intake_item(uuid, text) to authenticated;
