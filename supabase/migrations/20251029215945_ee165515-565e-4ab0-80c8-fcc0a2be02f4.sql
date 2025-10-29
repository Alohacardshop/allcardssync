-- Force recompilation of intake_items_audit_updated_by trigger function
-- This clears the stale cache that thinks updated_by doesn't exist

DROP TRIGGER IF EXISTS intake_items_audit_updated_by ON public.intake_items;
DROP FUNCTION IF EXISTS public.intake_items_audit_updated_by();

-- Recreate the function (identical code, but forces recompilation with current schema)
CREATE OR REPLACE FUNCTION public.intake_items_audit_updated_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid()::text, OLD.updated_by);
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
CREATE TRIGGER intake_items_audit_updated_by
BEFORE UPDATE ON public.intake_items
FOR EACH ROW
EXECUTE FUNCTION intake_items_audit_updated_by();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Recreated intake_items_audit_updated_by trigger with fresh schema cache';
END $$;