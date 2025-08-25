-- Harden functions by setting an explicit search_path

-- 1) Update has_role to set search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$$;

-- 2) Update generate_lot_number to set search_path (keep same logic)
CREATE OR REPLACE FUNCTION public.generate_lot_number()
RETURNS text
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
declare
  v_next bigint;
begin
  v_next := nextval('public.lot_number_seq');
  return 'LOT-' || to_char(v_next, 'FM000000');
end;
$function$;