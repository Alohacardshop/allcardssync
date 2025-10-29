-- COMPREHENSIVE FIX: Recreate trigger function to clear cached schema
-- This resolves: record 'new' has no field 'updated_by' error

-- Drop and recreate the trigger function to force schema recompilation
DROP TRIGGER IF EXISTS intake_items_audit_updated_by ON public.intake_items;
DROP FUNCTION IF EXISTS public.intake_items_audit_updated_by();

CREATE OR REPLACE FUNCTION public.intake_items_audit_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Set updated_at to current timestamp
  NEW.updated_at := now();
  
  -- Set updated_by: prefer explicit value, fallback to current user, then preserve old value
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid()::text, OLD.updated_by);
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER intake_items_audit_updated_by
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.intake_items_audit_updated_by();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Successfully recreated intake_items_audit_updated_by trigger';
  RAISE NOTICE '   - Trigger now compiled with current schema including updated_by column';
  RAISE NOTICE '⚠️  Run DISCARD ALL; in SQL Editor (separate tab) to clear connection cache';
END $$;