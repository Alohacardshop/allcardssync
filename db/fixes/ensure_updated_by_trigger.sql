-- Ensure updated_by trigger exists and is properly configured
-- This is idempotent - safe to run multiple times
-- 
-- Purpose: Automatically populate updated_at and updated_by on every UPDATE
-- to public.intake_items

-- 1. Create or replace the trigger function
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

-- 2. Drop trigger if it exists (for clean recreation)
DROP TRIGGER IF EXISTS intake_items_audit_updated_by ON public.intake_items;

-- 3. Create the trigger
-- Fires BEFORE UPDATE on every row
-- Order: 10 ensures it runs early in the trigger chain
CREATE TRIGGER intake_items_audit_updated_by
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.intake_items_audit_updated_by();

-- 4. Verify the trigger was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'intake_items_audit_updated_by' 
    AND tgrelid = 'public.intake_items'::regclass
  ) THEN
    RAISE NOTICE '✅ Trigger intake_items_audit_updated_by successfully created';
  ELSE
    RAISE EXCEPTION 'Failed to create trigger intake_items_audit_updated_by';
  END IF;
END $$;

-- 5. Test that the function can access the updated_by column
DO $$
DECLARE
  test_columns text[];
BEGIN
  -- Get all columns from intake_items
  SELECT array_agg(column_name::text)
  INTO test_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'intake_items'
    AND column_name IN ('updated_at', 'updated_by');
  
  IF 'updated_by' = ANY(test_columns) THEN
    RAISE NOTICE '✅ Column updated_by exists and is accessible';
  ELSE
    RAISE EXCEPTION 'Column updated_by does not exist - run migration first';
  END IF;
  
  IF 'updated_at' = ANY(test_columns) THEN
    RAISE NOTICE '✅ Column updated_at exists and is accessible';
  ELSE
    RAISE EXCEPTION 'Column updated_at does not exist';
  END IF;
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ updated_by trigger configured successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'All UPDATE operations on intake_items will now:';
  RAISE NOTICE '  1. Set updated_at to current timestamp';
  RAISE NOTICE '  2. Set updated_by to current user ID (if authenticated)';
  RAISE NOTICE '';
END $$;
