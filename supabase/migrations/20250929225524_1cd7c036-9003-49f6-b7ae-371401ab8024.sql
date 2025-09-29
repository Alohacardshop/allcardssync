-- Comprehensive fix for ALL remaining SECURITY DEFINER functions
-- This will identify and attempt to fix any function missing search_path

-- Create a temporary function to safely add search_path to existing functions
CREATE OR REPLACE FUNCTION pg_temp.fix_function_search_path(
  func_schema text,
  func_name text,
  func_args text
) RETURNS void AS $$
DECLARE
  func_def text;
  new_def text;
BEGIN
  -- Get the current function definition
  SELECT pg_get_functiondef(p.oid) INTO func_def
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = func_schema
    AND p.proname = func_name
    AND pg_get_function_identity_arguments(p.oid) = func_args;
    
  IF func_def IS NULL THEN
    RAISE NOTICE 'Function not found: %.%(%)', func_schema, func_name, func_args;
    RETURN;
  END IF;
  
  -- Check if it already has SET search_path
  IF func_def ~ 'SET search_path' THEN
    RAISE NOTICE 'Function %.%(%) already has search_path', func_schema, func_name, func_args;
    RETURN;
  END IF;
  
  -- Add SET search_path before the AS keyword
  new_def := regexp_replace(
    func_def,
    '(SECURITY DEFINER)\s+(AS)',
    E'\\1\nSET search_path TO ''public''\n\\2',
    'i'
  );
  
  -- Execute the new definition
  EXECUTE new_def;
  RAISE NOTICE 'Fixed: %.%(%)', func_schema, func_name, func_args;
END;
$$ LANGUAGE plpgsql;

-- Now fix all vulnerable functions
DO $$
DECLARE
  func_record RECORD;
  fixed_count INTEGER := 0;
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'FIXING ALL VULNERABLE FUNCTIONS';
  RAISE NOTICE '========================================';
  
  FOR func_record IN 
    SELECT 
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as arguments
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY p.proname
  LOOP
    BEGIN
      PERFORM pg_temp.fix_function_search_path(
        func_record.schema_name,
        func_record.function_name,
        func_record.arguments
      );
      fixed_count := fixed_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to fix %.%(%): %', 
        func_record.schema_name,
        func_record.function_name,
        func_record.arguments,
        SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'FIXED % FUNCTIONS', fixed_count;
  RAISE NOTICE '========================================';
END $$;

-- Final verification
DO $$
DECLARE
  vuln_count INTEGER;
  func_record RECORD;
BEGIN
  SELECT COUNT(*) INTO vuln_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.prosecdef = true 
    AND n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    );
    
  RAISE NOTICE '========================================';
  RAISE NOTICE 'FINAL VERIFICATION';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Remaining vulnerable functions: %', vuln_count;
  
  IF vuln_count > 0 THEN
    RAISE NOTICE 'List of remaining vulnerable functions:';
    FOR func_record IN
      SELECT 
        n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as full_name
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE p.prosecdef = true 
        AND n.nspname = 'public'
        AND NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) cfg
          WHERE cfg LIKE 'search_path=%'
        )
    LOOP
      RAISE NOTICE '  - %', func_record.full_name;
    END LOOP;
  ELSE
    RAISE NOTICE '✅ ALL FUNCTIONS ARE NOW SECURE!';
  END IF;
END $$;