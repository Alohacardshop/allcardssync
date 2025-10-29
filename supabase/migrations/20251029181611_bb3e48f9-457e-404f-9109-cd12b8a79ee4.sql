
-- Fix the create_intake_item_snapshot function and trigger completely
-- The issue is that the trigger may be using a cached version of the function

-- Drop and recreate the function with proper handling of updated_by
DROP FUNCTION IF EXISTS public.create_intake_item_snapshot() CASCADE;

CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  snapshot_creator uuid;
BEGIN
  -- Determine who created this snapshot
  -- For INSERT: use created_by
  -- For UPDATE: use updated_by if available, otherwise created_by
  -- For DELETE: use created_by
  IF TG_OP = 'INSERT' THEN
    snapshot_creator := NEW.created_by;
  ELSIF TG_OP = 'UPDATE' THEN
    snapshot_creator := COALESCE(
      NULLIF(NEW.updated_by, '')::uuid,  -- Try to cast updated_by from text to uuid
      NEW.created_by                      -- Fall back to created_by
    );
  ELSE  -- DELETE
    snapshot_creator := OLD.created_by;
  END IF;

  -- Create the snapshot
  INSERT INTO public.item_snapshots (
    intake_item_id,
    snapshot_type,
    snapshot_data,
    created_by,
    metadata
  )
  VALUES (
    COALESCE(NEW.id, OLD.id),
    TG_OP::text,
    CASE 
      WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD)
      ELSE to_jsonb(NEW)
    END,
    snapshot_creator,
    jsonb_build_object(
      'trigger_time', NOW(),
      'operation', TG_OP
    )
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate the trigger to use the updated function
DROP TRIGGER IF EXISTS snapshot_intake_items ON public.intake_items;

CREATE TRIGGER snapshot_intake_items
  AFTER INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.create_intake_item_snapshot();

-- Force PostgreSQL to recompile all prepared statements
DISCARD PLANS;
