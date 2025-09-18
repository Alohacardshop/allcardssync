-- Clear the problematic queue items that are stuck with GraphQL errors
DELETE FROM public.shopify_sync_queue 
WHERE error_message LIKE '%GraphQL%' OR error_message LIKE '%ProductVariantsBulkInput%';