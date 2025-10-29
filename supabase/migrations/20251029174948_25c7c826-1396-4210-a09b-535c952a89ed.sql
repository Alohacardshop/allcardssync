-- Drop and recreate update_updated_at_column to force recompilation with current schema
DROP TRIGGER IF EXISTS trg_intake_items_set_timestamp ON public.intake_items;
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Recreate the function - it will now compile with the current table schema including updated_by
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trg_intake_items_set_timestamp
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();