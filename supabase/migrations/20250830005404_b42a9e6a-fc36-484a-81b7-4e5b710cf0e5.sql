
CREATE OR REPLACE FUNCTION public.set_user_default_location(_store_key text, _location_gid text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- Ensure an assignment exists for this user/store/location; create it if missing
  insert into public.user_shopify_assignments (user_id, store_key, location_gid)
  values (auth.uid(), _store_key, _location_gid)
  on conflict (user_id, store_key, location_gid) do nothing;

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
