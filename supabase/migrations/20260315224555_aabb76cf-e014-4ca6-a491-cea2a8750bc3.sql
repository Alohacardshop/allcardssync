-- Add shopify_order_id to sales_events for tracking cross-channel order creation
ALTER TABLE public.sales_events 
  ADD COLUMN IF NOT EXISTS shopify_order_id text,
  ADD COLUMN IF NOT EXISTS shopify_order_name text,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;