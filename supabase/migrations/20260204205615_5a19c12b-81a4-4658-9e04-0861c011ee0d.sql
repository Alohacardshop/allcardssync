-- Create shopify_inventory_levels table for normalized inventory tracking
-- This stores the source-of-truth from Shopify inventory webhooks
CREATE TABLE IF NOT EXISTS public.shopify_inventory_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key text NOT NULL,
  inventory_item_id text NOT NULL,
  location_gid text NOT NULL,
  location_name text,
  available integer NOT NULL DEFAULT 0,
  shopify_updated_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Unique constraint for upserts
  CONSTRAINT shopify_inventory_levels_unique UNIQUE (store_key, inventory_item_id, location_gid)
);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_shopify_inventory_levels_store_key ON public.shopify_inventory_levels(store_key);
CREATE INDEX IF NOT EXISTS idx_shopify_inventory_levels_inventory_item_id ON public.shopify_inventory_levels(inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_shopify_inventory_levels_location ON public.shopify_inventory_levels(location_gid);

-- Enable RLS
ALTER TABLE public.shopify_inventory_levels ENABLE ROW LEVEL SECURITY;

-- RLS policies for staff/admin access only
CREATE POLICY "Staff can view inventory levels"
  ON public.shopify_inventory_levels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'staff')
    )
  );

CREATE POLICY "Staff can manage inventory levels"
  ON public.shopify_inventory_levels
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin', 'staff')
    )
  );

-- Service role bypass for edge functions
CREATE POLICY "Service role full access"
  ON public.shopify_inventory_levels
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Create timestamp update trigger
CREATE OR REPLACE FUNCTION update_shopify_inventory_levels_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_shopify_inventory_levels_updated_at
  BEFORE UPDATE ON public.shopify_inventory_levels
  FOR EACH ROW
  EXECUTE FUNCTION update_shopify_inventory_levels_timestamp();

-- Add dead_letter flag to webhook_events for failed events
ALTER TABLE public.webhook_events 
  ADD COLUMN IF NOT EXISTS dead_letter boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS processing_completed_at timestamp with time zone;

-- Create index for finding dead letter events
CREATE INDEX IF NOT EXISTS idx_webhook_events_dead_letter ON public.webhook_events(dead_letter) WHERE dead_letter = true;
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_retry ON public.webhook_events(status, retry_count) WHERE status = 'failed';

-- Comment for documentation
COMMENT ON TABLE public.shopify_inventory_levels IS 'Normalized Shopify inventory levels from webhooks. Keyed by (store_key, inventory_item_id, location_gid) for fast lookups and UI reads.';
COMMENT ON COLUMN public.webhook_events.dead_letter IS 'True if event has exceeded max_retries and should not be retried automatically';