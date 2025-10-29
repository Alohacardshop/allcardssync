-- Force recompilation of all trigger functions on intake_items to recognize updated_by column
-- This is done by recreating each function, which forces PostgreSQL to recompile with current schema

-- 1. Recreate create_intake_item_snapshot (uses to_jsonb which needs current schema)
DROP FUNCTION IF EXISTS public.create_intake_item_snapshot() CASCADE;
CREATE OR REPLACE FUNCTION public.create_intake_item_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.item_snapshots (intake_item_id, snapshot_type, snapshot_data, created_by, metadata)
    VALUES (OLD.id, 'deleted', to_jsonb(OLD), auth.uid(), 
            jsonb_build_object('deleted_at', now(), 'deleted_reason', OLD.deleted_reason));
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF (OLD.printed_at IS DISTINCT FROM NEW.printed_at) OR
       (OLD.pushed_at IS DISTINCT FROM NEW.pushed_at) OR  
       (OLD.price IS DISTINCT FROM NEW.price) OR
       (OLD.quantity IS DISTINCT FROM NEW.quantity) THEN
      INSERT INTO public.item_snapshots (intake_item_id, snapshot_type, snapshot_data, created_by, metadata)
      VALUES (NEW.id,
              CASE 
                WHEN OLD.printed_at IS NULL AND NEW.printed_at IS NOT NULL THEN 'printed'
                WHEN OLD.pushed_at IS NULL AND NEW.pushed_at IS NOT NULL THEN 'pushed'
                ELSE 'updated'
              END,
              to_jsonb(NEW), auth.uid(),
              jsonb_build_object('changes', jsonb_build_object(
                'printed_at', jsonb_build_object('old', OLD.printed_at, 'new', NEW.printed_at),
                'pushed_at', jsonb_build_object('old', OLD.pushed_at, 'new', NEW.pushed_at),
                'price', jsonb_build_object('old', OLD.price, 'new', NEW.price),
                'quantity', jsonb_build_object('old', OLD.quantity, 'new', NEW.quantity)
              )));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.item_snapshots (intake_item_id, snapshot_type, snapshot_data, created_by)
    VALUES (NEW.id, 'created', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER intake_item_snapshot_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION create_intake_item_snapshot();

-- 2. Recreate all other trigger functions to ensure they recognize current schema
DROP FUNCTION IF EXISTS public.close_lot_if_empty() CASCADE;
DROP FUNCTION IF EXISTS public.ensure_lot_exists() CASCADE;
DROP FUNCTION IF EXISTS public.prevent_non_admin_soft_delete() CASCADE;
DROP FUNCTION IF EXISTS public.set_intake_price_default() CASCADE;
DROP FUNCTION IF EXISTS public.trigger_shopify_item_removal() CASCADE;
DROP FUNCTION IF EXISTS public.update_lot_totals() CASCADE;
DROP FUNCTION IF EXISTS public.validate_item_lot_owner() CASCADE;