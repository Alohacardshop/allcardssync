
ALTER TABLE public.shopify_sync_job_items
  ADD COLUMN failure_code text;

COMMENT ON COLUMN public.shopify_sync_job_items.failure_code IS 'Structured error classification: duplicate, validation_error, rate_limited, shopify_api_error, network_error, missing_inventory_data, blocked_business_rule, unknown_error';
