-- Update trigger function to infer type when null
CREATE OR REPLACE FUNCTION public.trigger_shopify_item_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  removal_payload jsonb;
  item_type text;
BEGIN
  -- Only process if item is being soft deleted (deleted_at being set)
  IF TG_OP = 'UPDATE' 
     AND OLD.deleted_at IS NULL 
     AND NEW.deleted_at IS NOT NULL
     AND NEW.store_key IS NOT NULL
     AND (NEW.shopify_product_id IS NOT NULL OR NEW.sku IS NOT NULL)
  THEN
    
    -- Infer type if not set
    item_type := NEW.type;
    IF item_type IS NULL OR item_type = '' THEN
      -- Infer based on PSA cert or grade
      IF NEW.psa_cert IS NOT NULL AND NEW.psa_cert != '' THEN
        item_type := 'Graded';
      ELSIF NEW.grade IS NOT NULL AND NEW.grade != '' AND NEW.grade != '0' THEN
        item_type := 'Graded';
      ELSE
        item_type := 'Raw';
      END IF;
    END IF;
    
    IF item_type = 'Graded' THEN
      -- GRADED: Delete entire product
      removal_payload := jsonb_build_object(
        'storeKey', NEW.store_key,
        'productId', NEW.shopify_product_id,
        'sku', NEW.sku,
        'locationGid', NEW.shopify_location_gid,
        'itemId', NEW.id,
        'certNumber', COALESCE(NEW.psa_cert, NEW.cgc_cert)
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
      
    ELSIF item_type = 'Raw' THEN
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
$function$;