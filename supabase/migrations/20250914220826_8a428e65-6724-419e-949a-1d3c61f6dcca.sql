-- Fix all functions missing search_path protection
ALTER FUNCTION trigger_shopify_queue_sync() SET search_path = 'public';
ALTER FUNCTION cleanup_shopify_sync_queue() SET search_path = 'public';
ALTER FUNCTION check_shopify_queue_health() SET search_path = 'public';