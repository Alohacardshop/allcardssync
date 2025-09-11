-- Add trigger for raw cards and update graded trigger
DROP FUNCTION IF EXISTS public.trigger_shopify_graded_removal() CASCADE;

-- Combined trigger function that handles both graded and raw cards
CREATE OR REPLACE FUNCTION public.trigger_shopify_item_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  removal_payload jsonb;
BEGIN
  -- Only process if item is being soft deleted (deleted_at being set)
  IF TG_OP = 'UPDATE' 
     AND OLD.deleted_at IS NULL 
     AND NEW.deleted_at IS NOT NULL
     AND NEW.store_key IS NOT NULL
     AND (NEW.shopify_product_id IS NOT NULL OR NEW.sku IS NOT NULL)
  THEN
    
    IF NEW.type = 'Graded' THEN
      -- GRADED: Delete entire product
      removal_payload := jsonb_build_object(
        'storeKey', NEW.store_key,
        'productId', NEW.shopify_product_id,
        'sku', NEW.sku,
        'locationGid', NEW.shopify_location_gid,
        'itemId', NEW.id,
        'certNumber', NEW.psa_cert
      );

      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/v2-shopify-remove-graded',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := removal_payload
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Graded card Shopify removal failed: %', SQLERRM;
        UPDATE public.intake_items 
        SET last_shopify_removal_error = 'Graded removal failed: ' || SQLERRM,
            shopify_sync_status = 'error'
        WHERE id = NEW.id;
      END;
      
    ELSIF NEW.type = 'Raw' THEN
      -- RAW: Reduce quantity, keep product info
      removal_payload := jsonb_build_object(
        'storeKey', NEW.store_key,
        'productId', NEW.shopify_product_id,
        'sku', NEW.sku,
        'locationGid', NEW.shopify_location_gid,
        'itemId', NEW.id,
        'quantity', NEW.quantity
      );

      BEGIN
        PERFORM public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/v2-shopify-remove-raw',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := removal_payload
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Raw card Shopify quantity reduction failed: %', SQLERRM;
        UPDATE public.intake_items 
        SET last_shopify_removal_error = 'Raw quantity reduction failed: ' || SQLERRM,
            shopify_sync_status = 'error'
        WHERE id = NEW.id;
      END;
    END IF;
    
  END IF;

  RETURN NEW;
END;
$$;

-- Create the unified trigger
DROP TRIGGER IF EXISTS trigger_auto_shopify_graded_removal ON public.intake_items;
CREATE TRIGGER trigger_auto_shopify_removal
  AFTER UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_shopify_item_removal();