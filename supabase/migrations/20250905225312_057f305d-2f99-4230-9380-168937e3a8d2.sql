
-- 1) Ensure lots capture the creator automatically
create or replace function public.set_created_by_for_intake_lots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_created_by_intake_lots on public.intake_lots;
create trigger trg_set_created_by_intake_lots
before insert on public.intake_lots
for each row execute function public.set_created_by_for_intake_lots();

-- Helpful for performance on ownership checks
create index if not exists idx_intake_lots_created_by on public.intake_lots(created_by);

-- 2) Tighten intake_lots visibility/editing:
-- Only owner (created_by) or admins can see/update lots.
-- For legacy rows with created_by IS NULL, keep previous location-based visibility so existing data isn't locked out.

alter policy "Users can view intake_lots they have access to"
on public.intake_lots
using (
  (
    (store_key is null)
    or public.user_can_access_store_location(auth.uid(), store_key, shopify_location_gid)
  )
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or created_by = auth.uid()
    or created_by is null -- legacy fallback
  )
);

alter policy "Staff can update intake_lots they have access to"
on public.intake_lots
using (
  (
    (public.has_role(auth.uid(), 'staff'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
    and ((store_key is null) or public.user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
  )
  and (
    public.has_role(auth.uid(), 'admin'::app_role)
    or created_by = auth.uid()
    or created_by is null -- legacy fallback
  )
);

alter policy "Staff can insert intake_lots to accessible locations"
on public.intake_lots
with check (
  (public.has_role(auth.uid(), 'staff'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
  and ((store_key is null) or public.user_can_access_store_location(auth.uid(), store_key, shopify_location_gid))
  and (public.has_role(auth.uid(), 'admin'::app_role) or coalesce(created_by, auth.uid()) = auth.uid())
);

-- 3) Tighten intake_items visibility/editing to lot owner + admins:
-- Keep a safe legacy fallback for items without lot_id yet.

alter policy "Users can view intake_items they have access to"
on public.intake_items
using (
  exists (
    select 1
    from public.intake_lots l
    where l.id = intake_items.lot_id
      and (public.has_role(auth.uid(), 'admin'::app_role) or l.created_by = auth.uid())
  )
  or (
    intake_items.lot_id is null
    and ((intake_items.store_key is null)
      or public.user_can_access_store_location(auth.uid(), intake_items.store_key, intake_items.shopify_location_gid))
  )
);

alter policy "Authenticated users can update intake_items with access"
on public.intake_items
using (
  (auth.uid() is not null)
  and exists (
    select 1
    from public.intake_lots l
    where l.id = intake_items.lot_id
      and (public.has_role(auth.uid(), 'admin'::app_role) or l.created_by = auth.uid())
  )
)
with check (
  (auth.uid() is not null)
  and exists (
    select 1
    from public.intake_lots l
    where l.id = intake_items.lot_id
      and (public.has_role(auth.uid(), 'admin'::app_role) or l.created_by = auth.uid())
  )
);

alter policy "Users can update intake_items they have access to"
on public.intake_items
using (
  (public.has_role(auth.uid(), 'staff'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
  and exists (
    select 1
    from public.intake_lots l
    where l.id = intake_items.lot_id
      and (public.has_role(auth.uid(), 'admin'::app_role) or l.created_by = auth.uid())
  )
)
with check (
  (public.has_role(auth.uid(), 'staff'::app_role) or public.has_role(auth.uid(), 'admin'::app_role))
  and exists (
    select 1
    from public.intake_lots l
    where l.id = intake_items.lot_id
      and (public.has_role(auth.uid(), 'admin'::app_role) or l.created_by = auth.uid())
  )
);

-- 4) Let batch creators clear/delete their own batches (not just admins)
create or replace function public.admin_delete_batch(lot_id_in uuid, reason_in text default 'Batch deleted by admin'::text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_items integer := 0;
  v_is_allowed boolean;
begin
  -- Admins OR the user who created the lot can perform this
  select
    (public.has_role(auth.uid(), 'admin'::app_role))
    or exists (select 1 from public.intake_lots l where l.id = lot_id_in and l.created_by = auth.uid())
  into v_is_allowed;

  if not coalesce(v_is_allowed, false) then
    raise exception 'Access denied: Admin or lot owner required';
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
                  ' by ' ||
                  case when public.has_role(auth.uid(), 'admin'::app_role) then 'admin' else 'owner' end ||
                  case when reason_in is not null and length(reason_in) > 0
                       then ': ' || reason_in else '' end),
         total_items = 0,
         total_value = 0,
         updated_at = now()
   where id = lot_id_in;

  return v_items;
end;
$function$;
