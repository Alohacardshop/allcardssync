-- Create performance index for inventory aggregation queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_intake_items_inventory_sync 
ON public.intake_items (sku, store_key, shopify_location_gid) 
WHERE deleted_at IS NULL AND removed_from_batch_at IS NOT NULL;

-- Create trigger function to sync inventory changes to Shopify
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS TRIGGER AS $$
DECLARE
  sync_payload jsonb;
BEGIN
  -- Handle different trigger operations
  IF TG_OP = 'DELETE' THEN
    -- Sync the old SKU after deletion
    IF OLD.sku IS NOT NULL AND OLD.store_key IS NOT NULL THEN
      sync_payload := jsonb_build_object(
        'storeKey', OLD.store_key,
        'sku', OLD.sku,
        'locationGid', OLD.shopify_location_gid
      );
      
      PERFORM net.http_post(
        url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := sync_payload
      );
    END IF;
    RETURN OLD;
  ELSE
    -- Handle INSERT and UPDATE
    -- Check if this change affects inventory (in inventory status or relevant fields changed)
    IF NEW.sku IS NOT NULL AND NEW.store_key IS NOT NULL AND (
      TG_OP = 'INSERT' OR
      OLD.sku IS DISTINCT FROM NEW.sku OR
      OLD.quantity IS DISTINCT FROM NEW.quantity OR
      OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
      OLD.removed_from_batch_at IS DISTINCT FROM NEW.removed_from_batch_at OR
      OLD.store_key IS DISTINCT FROM NEW.store_key OR
      OLD.shopify_location_gid IS DISTINCT FROM NEW.shopify_location_gid
    ) THEN
      
      -- Sync the new SKU
      sync_payload := jsonb_build_object(
        'storeKey', NEW.store_key,
        'sku', NEW.sku,
        'locationGid', NEW.shopify_location_gid
      );
      
      PERFORM net.http_post(
        url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := sync_payload
      );
      
      -- If SKU changed on UPDATE, also sync the old SKU
      IF TG_OP = 'UPDATE' AND OLD.sku IS DISTINCT FROM NEW.sku AND OLD.sku IS NOT NULL THEN
        sync_payload := jsonb_build_object(
          'storeKey', OLD.store_key,
          'sku', OLD.sku,
          'locationGid', OLD.shopify_location_gid
        );
        
        PERFORM net.http_post(
          url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := sync_payload
        );
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;