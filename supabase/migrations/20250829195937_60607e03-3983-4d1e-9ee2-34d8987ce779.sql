-- SECURITY MITIGATION: Since we cannot drop the vault.decrypted_secrets view 
-- (it's a system view owned by supabase_admin), we'll implement access controls

-- Create a security policy on vault.decrypted_secrets if possible
DO $$
BEGIN
  -- Try to enable RLS on vault.decrypted_secrets
  BEGIN
    ALTER TABLE vault.decrypted_secrets ENABLE ROW LEVEL SECURITY;
    
    -- Create restrictive policy - only allow admin users
    CREATE POLICY "Admin only access to decrypted secrets" 
    ON vault.decrypted_secrets
    FOR ALL 
    USING (has_role(auth.uid(), 'admin'::app_role));
    
    RAISE NOTICE 'Successfully secured vault.decrypted_secrets with RLS policy';
    
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'Cannot modify vault.decrypted_secrets - insufficient privileges';
  WHEN others THEN
    RAISE WARNING 'Cannot secure vault.decrypted_secrets: %', SQLERRM;
  END;
END $$;

-- Create a secure wrapper function that logs access attempts
CREATE OR REPLACE FUNCTION public.secure_get_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  -- Require admin role
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    -- Log unauthorized access attempt
    INSERT INTO public.system_settings (key_name, key_value, description, category)
    VALUES (
      'security_log_' || extract(epoch from now())::text,
      jsonb_build_object(
        'event', 'unauthorized_secret_access',
        'user_id', auth.uid(),
        'secret_name', secret_name,
        'timestamp', now(),
        'ip_address', inet_client_addr()
      )::text,
      'Security log: Unauthorized secret access attempt',
      'security'
    )
    ON CONFLICT (key_name) DO NOTHING;
    
    RAISE EXCEPTION 'Access denied: Admin role required to access secrets';
  END IF;
  
  -- Use our own secure method instead of the vulnerable view
  RETURN (
    SELECT key_value 
    FROM public.system_settings 
    WHERE key_name = secret_name
    LIMIT 1
  );
END;
$function$;

-- Document the security issue for administrators
INSERT INTO public.system_settings (key_name, key_value, description, category)
VALUES (
  'SECURITY_WARNING_VAULT_VIEW',
  'The vault.decrypted_secrets view poses a security risk by exposing decrypted secrets without proper access controls. Use the secure_get_secret() function instead.',
  'Security warning about vault.decrypted_secrets view',
  'security'
)
ON CONFLICT (key_name) DO UPDATE SET
  key_value = EXCLUDED.key_value,
  description = EXCLUDED.description,
  updated_at = now();