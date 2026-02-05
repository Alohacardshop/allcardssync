-- Create webhook_health_alerts table for per-location alert throttling
CREATE TABLE IF NOT EXISTS public.webhook_health_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  store_key TEXT NOT NULL,
  location_gid TEXT,
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  minutes_since_activity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for efficient lookups by store/location and time
CREATE INDEX IF NOT EXISTS idx_webhook_health_alerts_lookup 
  ON public.webhook_health_alerts (store_key, location_gid, alerted_at DESC)
  WHERE resolved_at IS NULL;

-- Index for cleanup of old resolved alerts
CREATE INDEX IF NOT EXISTS idx_webhook_health_alerts_resolved 
  ON public.webhook_health_alerts (resolved_at)
  WHERE resolved_at IS NOT NULL;

-- Enable RLS
ALTER TABLE public.webhook_health_alerts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view alerts (admin dashboard)
CREATE POLICY "Authenticated users can view webhook health alerts"
  ON public.webhook_health_alerts
  FOR SELECT
  TO authenticated
  USING (true);

-- Service role can manage alerts (edge functions)
CREATE POLICY "Service role can manage webhook health alerts"
  ON public.webhook_health_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.webhook_health_alerts IS 'Tracks webhook health alerts sent per store/location for throttling and audit purposes';