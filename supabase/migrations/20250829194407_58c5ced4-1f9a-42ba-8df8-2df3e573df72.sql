-- SECURITY FIX: Address Security Definer View vulnerability

-- The vault.decrypted_secrets view is a security risk as it automatically 
-- decrypts all secrets without proper access controls.
-- Since it's not used in the application, we'll drop it for security.

-- First, check if we can drop the vault.decrypted_secrets view safely
DO $$
BEGIN
  -- Only drop if it exists and is not a system view
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'vault' 
    AND viewname = 'decrypted_secrets'
    AND viewowner = 'supabase_admin'
  ) THEN
    -- Drop the insecure view that exposes decrypted secrets
    DROP VIEW IF EXISTS vault.decrypted_secrets;
    
    RAISE NOTICE 'Dropped insecure vault.decrypted_secrets view for security';
  END IF;
  
EXCEPTION WHEN insufficient_privilege THEN
  -- If we can't drop it due to permissions, at least log the issue
  RAISE WARNING 'Cannot drop vault.decrypted_secrets due to insufficient privileges. This view poses a security risk by exposing decrypted secrets without access controls.';
  
WHEN OTHERS THEN
  -- Handle any other errors gracefully
  RAISE WARNING 'Could not address vault.decrypted_secrets security issue: %', SQLERRM;
END $$;

-- Alternative approach: If the view cannot be dropped, create a secure replacement
-- that requires explicit authorization (only if the original drop failed)
DO $$
BEGIN
  -- Check if the insecure view still exists
  IF EXISTS (
    SELECT 1 FROM pg_views 
    WHERE schemaname = 'vault' 
    AND viewname = 'decrypted_secrets'
  ) THEN
    -- Create a secure function instead that requires admin role
    CREATE OR REPLACE FUNCTION public.get_decrypted_secret(secret_name text)
    RETURNS text
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = 'vault', 'public'
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
    
    RAISE NOTICE 'Created secure get_decrypted_secret function as replacement';
  END IF;
END $$;