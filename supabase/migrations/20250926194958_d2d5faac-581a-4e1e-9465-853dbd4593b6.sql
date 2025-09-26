-- Clear all items from the Shopify sync queue to resolve rate limiting bottleneck
DELETE FROM public.shopify_sync_queue;

-- Log the cleanup action for audit purposes
INSERT INTO public.system_logs (level, message, context, source)
VALUES (
  'info',
  'Shopify sync queue cleared due to rate limiting bottleneck',
  jsonb_build_object(
    'reason', 'rate_limiting_errors',
    'cleared_at', now(),
    'action', 'manual_queue_clear'
  ),
  'admin_intervention'
);