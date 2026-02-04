-- Add active flag to shopify_stores
ALTER TABLE public.shopify_stores 
ADD COLUMN IF NOT EXISTS active boolean DEFAULT true;

-- Create reconciliation location stats table for per-location tracking
CREATE TABLE IF NOT EXISTS public.reconciliation_location_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.sync_health_runs(id) ON DELETE CASCADE,
  store_key text NOT NULL,
  location_gid text NOT NULL,
  location_name text,
  items_checked integer DEFAULT 0,
  drift_detected integer DEFAULT 0,
  drift_fixed integer DEFAULT 0,
  errors integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_location_stats_run_id 
ON public.reconciliation_location_stats(run_id);

CREATE INDEX IF NOT EXISTS idx_reconciliation_location_stats_store_location 
ON public.reconciliation_location_stats(store_key, location_gid);

-- Add last_reconciled_at to shopify_inventory_levels
ALTER TABLE public.shopify_inventory_levels 
ADD COLUMN IF NOT EXISTS last_reconciled_at timestamp with time zone;

-- Enable RLS
ALTER TABLE public.reconciliation_location_stats ENABLE ROW LEVEL SECURITY;

-- Create read policy for authenticated users
CREATE POLICY "Allow authenticated read on reconciliation_location_stats"
ON public.reconciliation_location_stats
FOR SELECT
USING (auth.role() = 'authenticated');