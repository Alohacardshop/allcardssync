-- Security fixes for Edge Functions and database access

-- Fix get_decrypted_secret function security and search path
CREATE OR REPLACE FUNCTION public.get_decrypted_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only allow admin users to decrypt secrets
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Access denied: Admin role required to decrypt secrets';
  END IF;
  
  -- Return the decrypted secret for the specific name
  RETURN (
    SELECT convert_from(
      vault._crypto_aead_det_decrypt(
        message => decode(secret, 'base64'::text), 
        additional => convert_to(id::text, 'utf8'::name), 
        key_id => (0)::bigint, 
        context => '\x7067736f6469756d'::bytea, 
        nonce => nonce
      ), 
      'utf8'::name
    )
    FROM vault.secrets 
    WHERE name = secret_name
    LIMIT 1
  );
END;
$function$;

-- Fix all database functions to include proper search_path
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id AND ur.role = _role
  );
$function$;

CREATE OR REPLACE FUNCTION public.user_can_access_store_location(_user_id uuid, _store_key text, _location_gid text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Admins can access everything
  SELECT CASE 
    WHEN has_role(_user_id, 'admin'::app_role) THEN true
    -- For non-admins, check if they have assignment to this store/location
    WHEN _location_gid IS NULL THEN EXISTS (
      SELECT 1 FROM user_shopify_assignments usa
      WHERE usa.user_id = _user_id AND usa.store_key = _store_key
    )
    ELSE EXISTS (
      SELECT 1 FROM user_shopify_assignments usa  
      WHERE usa.user_id = _user_id 
        AND usa.store_key = _store_key 
        AND usa.location_gid = _location_gid
    )
  END;
$function$;

-- Remove public read access from games table (keep admin/staff access only)
DROP POLICY IF EXISTS "Public read access" ON public.games;

-- Ensure catalog functions have proper search paths
CREATE OR REPLACE FUNCTION public.generate_lot_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_next bigint;
begin
  v_next := nextval('public.lot_number_seq');
  return 'LOT-' || to_char(v_next, 'FM000000');
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;