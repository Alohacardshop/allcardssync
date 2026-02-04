-- Table to track reconciliation runs and sync health status
CREATE TABLE IF NOT EXISTS public.sync_health_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  run_type text NOT NULL CHECK (run_type IN ('inventory_reconcile', 'webhook_check', 'drift_scan')),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  items_checked integer NOT NULL DEFAULT 0,
  drift_detected integer NOT NULL DEFAULT 0,
  drift_fixed integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_sync_health_runs_store_key ON public.sync_health_runs(store_key, run_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_health_runs_status ON public.sync_health_runs(status, started_at DESC);

-- Add shopify_drift flag to intake_items if it doesn't exist
ALTER TABLE public.intake_items 
  ADD COLUMN IF NOT EXISTS shopify_drift boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopify_drift_detected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS shopify_drift_details jsonb;

-- Create index for drift queries
CREATE INDEX IF NOT EXISTS idx_intake_items_drift ON public.intake_items(shopify_drift) WHERE shopify_drift = true;

-- Enable RLS
ALTER TABLE public.sync_health_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for sync_health_runs
CREATE POLICY "Allow authenticated users to view sync_health_runs"
  ON public.sync_health_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow service role to manage sync_health_runs"
  ON public.sync_health_runs FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);