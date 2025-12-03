-- Phase 1: eBay Sync Database Schema
-- Add marketplace selection and eBay listing columns to intake_items

-- Marketplace selection flags
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS list_on_shopify BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS list_on_ebay BOOLEAN DEFAULT false;

-- eBay listing tracking columns
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS ebay_listing_id TEXT,
ADD COLUMN IF NOT EXISTS ebay_offer_id TEXT,
ADD COLUMN IF NOT EXISTS ebay_inventory_item_sku TEXT,
ADD COLUMN IF NOT EXISTS ebay_sync_status TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ebay_sync_error TEXT,
ADD COLUMN IF NOT EXISTS last_ebay_synced_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ebay_listing_url TEXT,
ADD COLUMN IF NOT EXISTS ebay_sync_snapshot JSONB;

-- Add comment for ebay_sync_status values
COMMENT ON COLUMN public.intake_items.ebay_sync_status IS 'eBay sync status: pending, synced, failed, ended, or null if not listed on eBay';

-- Create indexes for eBay columns
CREATE INDEX IF NOT EXISTS idx_intake_items_ebay_listing_id ON public.intake_items (ebay_listing_id) WHERE ebay_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intake_items_ebay_sync_status ON public.intake_items (ebay_sync_status) WHERE ebay_sync_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intake_items_list_on_ebay ON public.intake_items (list_on_ebay) WHERE list_on_ebay = true;

-- ===============================================
-- Create ebay_store_config table
-- ===============================================
CREATE TABLE IF NOT EXISTS public.ebay_store_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_key TEXT UNIQUE NOT NULL,
  marketplace_id TEXT NOT NULL DEFAULT 'EBAY_US',
  location_key TEXT,
  environment TEXT NOT NULL DEFAULT 'PRODUCTION', -- PRODUCTION or SANDBOX
  
  -- OAuth tokens (refresh token stored encrypted)
  ebay_user_id TEXT,
  oauth_connected_at TIMESTAMPTZ,
  
  -- Default listing settings
  default_condition_id TEXT DEFAULT '3000', -- Very Good
  default_category_id TEXT,
  default_shipping_policy_id TEXT,
  default_payment_policy_id TEXT,
  default_return_policy_id TEXT,
  default_fulfillment_policy_id TEXT,
  
  -- Listing templates
  title_template TEXT,
  description_template TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comment
COMMENT ON TABLE public.ebay_store_config IS 'eBay marketplace configuration per store';

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_ebay_store_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ebay_store_config_updated_at ON public.ebay_store_config;
CREATE TRIGGER update_ebay_store_config_updated_at
  BEFORE UPDATE ON public.ebay_store_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ebay_store_config_updated_at();

-- RLS for ebay_store_config
ALTER TABLE public.ebay_store_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ebay_store_config"
  ON public.ebay_store_config
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_store_config"
  ON public.ebay_store_config
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ===============================================
-- Create ebay_sync_queue table
-- ===============================================
CREATE TABLE IF NOT EXISTS public.ebay_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id UUID NOT NULL REFERENCES public.intake_items(id) ON DELETE CASCADE,
  
  -- Action to perform
  action TEXT NOT NULL, -- 'create', 'update', 'end', 'revise_quantity'
  
  -- Queue status
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'completed', 'failed'
  queue_position SERIAL,
  
  -- Processing metadata
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_after TIMESTAMPTZ,
  
  -- Processor tracking
  processor_id TEXT,
  processor_heartbeat TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  error_type TEXT,
  
  -- Payload for the action (e.g., new quantity for revise_quantity)
  payload JSONB,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

-- Add comments
COMMENT ON TABLE public.ebay_sync_queue IS 'Queue for eBay sync operations (create, update, end listings)';
COMMENT ON COLUMN public.ebay_sync_queue.action IS 'Action: create, update, end, revise_quantity';
COMMENT ON COLUMN public.ebay_sync_queue.status IS 'Status: queued, processing, completed, failed';

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_ebay_sync_queue_status ON public.ebay_sync_queue (status);
CREATE INDEX IF NOT EXISTS idx_ebay_sync_queue_inventory_item_id ON public.ebay_sync_queue (inventory_item_id);
CREATE INDEX IF NOT EXISTS idx_ebay_sync_queue_queue_position ON public.ebay_sync_queue (queue_position) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_ebay_sync_queue_retry_after ON public.ebay_sync_queue (retry_after) WHERE status = 'failed' AND retry_after IS NOT NULL;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_ebay_sync_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_ebay_sync_queue_updated_at ON public.ebay_sync_queue;
CREATE TRIGGER update_ebay_sync_queue_updated_at
  BEFORE UPDATE ON public.ebay_sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ebay_sync_queue_updated_at();

-- RLS for ebay_sync_queue
ALTER TABLE public.ebay_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ebay_sync_queue"
  ON public.ebay_sync_queue
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view ebay_sync_queue"
  ON public.ebay_sync_queue
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can insert to ebay_sync_queue"
  ON public.ebay_sync_queue
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- ===============================================
-- Helper function to add items to eBay sync queue
-- ===============================================
CREATE OR REPLACE FUNCTION public.add_to_ebay_sync_queue(
  item_ids UUID[],
  sync_action TEXT DEFAULT 'create'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inserted_count INTEGER := 0;
  item_id UUID;
BEGIN
  FOREACH item_id IN ARRAY item_ids LOOP
    INSERT INTO ebay_sync_queue (
      inventory_item_id,
      action,
      status,
      retry_count,
      max_retries,
      created_by
    ) VALUES (
      item_id,
      sync_action,
      'queued',
      0,
      3,
      auth.uid()
    )
    ON CONFLICT DO NOTHING;
    inserted_count := inserted_count + 1;
  END LOOP;
  
  RETURN json_build_object(
    'success', true,
    'queued_items', inserted_count
  );
END;
$$;