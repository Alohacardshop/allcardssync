-- Defensive audit trigger for intake_items
-- Automatically sets updated_at and updated_by on every UPDATE
-- This ensures audit trail is maintained even if callers forget to set these fields

-- Drop existing timestamp trigger since this replaces it
DROP TRIGGER IF EXISTS trg_intake_items_set_timestamp ON public.intake_items;

-- Create comprehensive audit function
CREATE OR REPLACE FUNCTION public.intake_items_audit_updated_by()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Always set updated_at to current timestamp
  NEW.updated_at := now();
  
  -- Set updated_by to current user if available, otherwise keep existing value
  -- This allows system processes to explicitly set updated_by while ensuring
  -- user actions are always tracked
  NEW.updated_by := coalesce(auth.uid()::text, NEW.updated_by);
  
  RETURN NEW;
END;
$function$;

-- Create trigger to run before every UPDATE
CREATE TRIGGER intake_items_set_updated_by
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.intake_items_audit_updated_by();

-- Note: This trigger runs BEFORE UPDATE, ensuring audit fields are always set
-- regardless of whether the caller explicitly provides them