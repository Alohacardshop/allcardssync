-- Clear the current Shopify sync queue
DELETE FROM public.shopify_sync_queue;

-- Re-queue inventory items that should be synced to Shopify
-- (items that are in inventory but not yet synced or have sync errors)
INSERT INTO public.shopify_sync_queue (inventory_item_id, action, status)
SELECT 
    ii.id,
    CASE 
        WHEN ii.shopify_product_id IS NOT NULL THEN 'update'
        ELSE 'create'
    END as action,
    'queued' as status
FROM public.intake_items ii
WHERE ii.removed_from_batch_at IS NOT NULL  -- Item is in inventory
    AND ii.deleted_at IS NULL               -- Item is not deleted
    AND ii.quantity > 0                     -- Item has quantity
    AND COALESCE(ii.shopify_sync_status, 'pending') IN ('pending', 'failed', 'error')  -- Needs sync
    AND COALESCE(ii.variant, '') != 'Bulk'  -- Exclude bulk items
    AND COALESCE(ii.variant, '') != 'Other' -- Exclude other items