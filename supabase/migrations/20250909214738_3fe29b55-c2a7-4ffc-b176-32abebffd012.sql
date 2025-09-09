-- Create trigger function to automatically remove items from Shopify when deleted locally
CREATE OR REPLACE FUNCTION public.trigger_shopify_item_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
    -- Call the shopify removal function asynchronously
    removal_payload := jsonb_build_object(
      'storeKey', NEW.store_key,
      'productId', NEW.shopify_product_id,
      'sku', NEW.sku,
      'locationGid', NEW.shopify_location_gid,
      'itemIds', jsonb_build_array(NEW.id)
    );

    BEGIN
      PERFORM public.http_post_async(
        url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-remove-or-zero',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := removal_payload
      );
    EXCEPTION WHEN OTHERS THEN
      -- Log error but don't fail the deletion
      RAISE NOTICE 'Shopify removal dispatch failed: %', SQLERRM;
      
      -- Update the item with error info
      UPDATE public.intake_items 
      SET last_shopify_removal_error = 'Automatic removal failed: ' || SQLERRM,
          shopify_sync_status = 'error'
      WHERE id = NEW.id;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger to automatically remove items from Shopify when deleted locally
DROP TRIGGER IF EXISTS trigger_auto_shopify_removal ON public.intake_items;
CREATE TRIGGER trigger_auto_shopify_removal
  AFTER UPDATE ON public.intake_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_shopify_item_removal();