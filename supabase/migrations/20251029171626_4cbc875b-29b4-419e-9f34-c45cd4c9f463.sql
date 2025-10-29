-- Force recompile of the trigger function to see updated table schema
-- Drop and recreate the trigger to ensure it picks up the updated_by column

DROP TRIGGER IF EXISTS trigger_inventory_shopify_queue_sync ON public.intake_items CASCADE;

CREATE TRIGGER trigger_inventory_shopify_queue_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW 
  EXECUTE FUNCTION public.trigger_shopify_queue_sync();