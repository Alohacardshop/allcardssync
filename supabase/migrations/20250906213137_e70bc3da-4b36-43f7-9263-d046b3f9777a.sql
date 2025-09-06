-- Create function to check if inventory sync is enabled
CREATE OR REPLACE FUNCTION public.is_inventory_sync_enabled()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
  SELECT COALESCE(
    (SELECT key_value FROM system_settings WHERE key_name = 'INVENTORY_SYNC_MODE'),
    'manual'
  ) = 'auto';
$function$