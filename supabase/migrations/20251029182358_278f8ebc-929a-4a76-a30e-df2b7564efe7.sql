-- Add updated_by column to intake_items table
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS updated_by text;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_intake_items_updated_by 
ON public.intake_items(updated_by);

-- Now force rebuild all triggers to see the new column
DROP TRIGGER IF EXISTS auto_queue_shopify_sync ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS ensure_lot_exists_trigger ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS snapshot_intake_items ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trg_close_lot_if_empty ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trg_intake_items_price_default ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trg_intake_items_set_timestamp ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trg_prevent_non_admin_soft_delete ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trigger_auto_shopify_removal ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS trigger_inventory_shopify_queue_sync ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS update_lot_totals_trigger ON public.intake_items CASCADE;
DROP TRIGGER IF EXISTS validate_item_lot_owner_trigger ON public.intake_items CASCADE;

-- Recreate all triggers (BEFORE triggers first, then AFTER)
CREATE TRIGGER ensure_lot_exists_trigger
  BEFORE INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.ensure_lot_exists();

CREATE TRIGGER trg_intake_items_price_default
  BEFORE INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.set_intake_price_default();

CREATE TRIGGER trg_intake_items_set_timestamp
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_prevent_non_admin_soft_delete
  BEFORE UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_non_admin_soft_delete();

CREATE TRIGGER validate_item_lot_owner_trigger
  BEFORE INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_item_lot_owner();

CREATE TRIGGER snapshot_intake_items
  AFTER INSERT OR UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.create_intake_item_snapshot();

CREATE TRIGGER auto_queue_shopify_sync
  AFTER UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.auto_queue_for_shopify_sync();

CREATE TRIGGER trg_close_lot_if_empty
  AFTER DELETE OR UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.close_lot_if_empty();

CREATE TRIGGER trigger_auto_shopify_removal
  AFTER UPDATE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_shopify_item_removal();

CREATE TRIGGER trigger_inventory_shopify_queue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.trigger_shopify_queue_sync();

CREATE TRIGGER update_lot_totals_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.update_lot_totals();