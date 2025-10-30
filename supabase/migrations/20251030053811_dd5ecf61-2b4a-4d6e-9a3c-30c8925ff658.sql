-- Create tracking table for Discord-notified orders
CREATE TABLE IF NOT EXISTS public.discord_notified_orders (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL,
  order_name TEXT NOT NULL,
  store_key TEXT NOT NULL,
  notified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(order_id, store_key)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_discord_notified_orders_order_id ON public.discord_notified_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_discord_notified_orders_store_key ON public.discord_notified_orders(store_key);
CREATE INDEX IF NOT EXISTS idx_discord_notified_orders_notified_at ON public.discord_notified_orders(notified_at);

-- Enable RLS
ALTER TABLE public.discord_notified_orders ENABLE ROW LEVEL SECURITY;

-- System can manage (for edge functions)
CREATE POLICY "System can manage discord_notified_orders"
  ON public.discord_notified_orders
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admins can view
CREATE POLICY "Admins can view discord_notified_orders"
  ON public.discord_notified_orders
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Set up cron job to poll every 10 minutes
SELECT cron.schedule(
  'poll-shopify-ebay-orders',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url:='https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-poll-ebay-orders',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk"}'::jsonb,
    body:='{}'::jsonb
  ) as request_id;
  $$
);