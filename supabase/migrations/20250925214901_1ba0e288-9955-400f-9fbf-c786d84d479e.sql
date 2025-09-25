-- Add error_type column to shopify_sync_queue for better error categorization
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN IF NOT EXISTS error_type text;

-- Add index for better performance on queue processing
CREATE INDEX IF NOT EXISTS idx_shopify_sync_queue_status_retry 
ON public.shopify_sync_queue (status, retry_count, retry_after);

-- Add started_at column for processing tracking
ALTER TABLE public.shopify_sync_queue 
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;

-- Enable real-time for shopify_sync_queue table
ALTER TABLE public.shopify_sync_queue REPLICA IDENTITY FULL;
ALTER publication supabase_realtime ADD TABLE public.shopify_sync_queue;