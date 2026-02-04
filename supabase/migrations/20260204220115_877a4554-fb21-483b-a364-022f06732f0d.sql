-- Table to track last webhook received per store/location for Sync Health dashboard
CREATE TABLE IF NOT EXISTS public.webhook_health (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_key TEXT NOT NULL,
  location_gid TEXT, -- NULL for store-level webhooks
  topic TEXT NOT NULL,
  last_received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_webhook_id TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(store_key, location_gid, topic)
);

-- Create partial unique index for null location_gid
CREATE UNIQUE INDEX IF NOT EXISTS webhook_health_store_topic_unique 
ON webhook_health (store_key, topic) 
WHERE location_gid IS NULL;

-- Index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_webhook_health_store_key ON webhook_health(store_key);
CREATE INDEX IF NOT EXISTS idx_webhook_health_last_received ON webhook_health(last_received_at DESC);

-- Enable RLS
ALTER TABLE public.webhook_health ENABLE ROW LEVEL SECURITY;

-- RLS policies - allow authenticated users with staff/admin role
CREATE POLICY "Staff and admins can view webhook health"
ON public.webhook_health FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'staff')
  )
);

-- Add store_key and location_gid to webhook_events for faster querying
ALTER TABLE public.webhook_events 
  ADD COLUMN IF NOT EXISTS store_key TEXT,
  ADD COLUMN IF NOT EXISTS location_gid TEXT;

-- Index for webhook_events store/location queries
CREATE INDEX IF NOT EXISTS idx_webhook_events_store_key ON webhook_events(store_key);
CREATE INDEX IF NOT EXISTS idx_webhook_events_location_gid ON webhook_events(location_gid);