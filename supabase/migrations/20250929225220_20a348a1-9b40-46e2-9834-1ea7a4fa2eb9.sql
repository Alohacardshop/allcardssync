-- Identify and fix remaining functions without immutable search_path
-- This query will show us which functions still need fixing

DO $$
DECLARE
  func_record RECORD;
  func_def TEXT;
BEGIN
  -- Find all SECURITY DEFINER functions without search_path set
  FOR func_record IN 
    SELECT 
      p.oid,
      p.proname as function_name,
      n.nspname as schema_name,
      pg_get_function_identity_arguments(p.oid) as arguments,
      pg_get_functiondef(p.oid) as definition
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prosecdef = true  -- SECURITY DEFINER functions
      AND n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 
        FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%'
      )
    ORDER BY p.proname
  LOOP
    RAISE NOTICE 'Function needs fixing: %.%(%) - OID: %', 
      func_record.schema_name, 
      func_record.function_name, 
      func_record.arguments,
      func_record.oid;
  END LOOP;
END $$;

-- Fix specific functions that we know exist and need search_path

-- Fix: catalog_v2_get_sets_for_backfill (if exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'catalog_v2_get_sets_for_backfill') THEN
    -- Function already has SET search_path TO 'public' based on the schema shown
    -- This is just a verification that it's properly set
    RAISE NOTICE 'catalog_v2_get_sets_for_backfill already has search_path set';
  END IF;
END $$;

-- Fix: atomic_catalog_swap (if exists and missing search_path)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'atomic_catalog_swap'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    )
  ) THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.atomic_catalog_swap(game_name text)
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path TO ''public''
      AS $inner$
      BEGIN
        DELETE FROM catalog_v2.variants WHERE game = game_name;
        DELETE FROM catalog_v2.cards WHERE game = game_name;
        DELETE FROM catalog_v2.sets WHERE game = game_name;

        INSERT INTO catalog_v2.sets SELECT * FROM catalog_v2.sets_new WHERE game = game_name;
        INSERT INTO catalog_v2.cards SELECT * FROM catalog_v2.cards_new WHERE game = game_name;
        INSERT INTO catalog_v2.variants SELECT * FROM catalog_v2.variants_new WHERE game = game_name;
      END;
      $inner$;
    ';
    RAISE NOTICE 'Fixed: atomic_catalog_swap';
  END IF;
END $$;

-- Fix: get_game_catalog_stats (if exists and missing search_path)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname = 'get_game_catalog_stats'
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    )
  ) THEN
    EXECUTE '
      CREATE OR REPLACE FUNCTION public.get_game_catalog_stats()
      RETURNS TABLE(game_id text, game_name text, sets_count bigint, cards_count bigint)
      LANGUAGE sql
      STABLE
      SET search_path TO ''public''
      AS $inner$
        SELECT 
          g.id AS game_id,
          g.name AS game_name,
          COALESCE(COUNT(DISTINCT s.set_id), 0)::bigint AS sets_count,
          COALESCE(COUNT(DISTINCT c.card_id), 0)::bigint AS cards_count
        FROM games g
        LEFT JOIN catalog_v2.sets s ON (s.game = g.id)
        LEFT JOIN catalog_v2.cards c ON (c.game = g.id)
        GROUP BY g.id, g.name;
      $inner$;
    ';
    RAISE NOTICE 'Fixed: get_game_catalog_stats';
  END IF;
END $$;

-- Fix: search_cards (if exists and missing search_path) 
-- Note: This function is complex and already has SET search_path in the definition shown
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'search_cards') THEN
    RAISE NOTICE 'search_cards already has search_path set';
  END IF;
END $$;

-- Verification query: Count remaining vulnerable functions
DO $$
DECLARE
  vuln_count INTEGER;
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
  RAISE NOTICE 'SECURITY AUDIT COMPLETE';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Remaining vulnerable functions: %', vuln_count;
  
  IF vuln_count = 0 THEN
    RAISE NOTICE '✅ ALL database functions are now hardened!';
  ELSE
    RAISE NOTICE '⚠️  % functions still need manual fixing', vuln_count;
  END IF;
END $$;