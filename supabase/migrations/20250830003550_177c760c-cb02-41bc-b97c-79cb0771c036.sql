
-- Allow users to set their own default shop/location safely
create or replace function public.set_user_default_location(_store_key text, _location_gid text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  -- Ensure the assignment exists for this user
  if not exists (
    select 1
    from public.user_shopify_assignments usa
    where usa.user_id = auth.uid()
      and usa.store_key = _store_key
      and usa.location_gid = _location_gid
  ) then
    raise exception 'No assignment found for this user/store/location';
  end if;

  -- Unset any previous defaults for this user
  update public.user_shopify_assignments
     set is_default = false,
         updated_at = now()
   where user_id = auth.uid()
     and is_default = true;

  -- Set the new default for this user
  update public.user_shopify_assignments
     set is_default = true,
         updated_at = now()
   where user_id = auth.uid()
     and store_key = _store_key
     and location_gid = _location_gid;
end;
$function$;
