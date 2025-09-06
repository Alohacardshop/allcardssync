-- Ensure NO Shopify triggers fire on intake_items
DROP TRIGGER IF EXISTS intake_items_shopify_sync ON public.intake_items;
DROP FUNCTION IF EXISTS public.intake_items_shopify_sync() CASCADE;

-- Show non-internal triggers still attached (for debugging)
SELECT tgname, tgenabled, pg_get_triggerdef(oid) as def
FROM pg_trigger
WHERE tgrelid = 'public.intake_items'::regclass
  AND NOT tgisinternal;