-- Create inventory_write_log table for tracking all Shopify inventory writes
CREATE TABLE public.inventory_write_log (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    
    -- Request context
    request_id TEXT NOT NULL,
    store_key TEXT NOT NULL,
    
    -- Item identification
    item_id UUID,
    sku TEXT,
    inventory_item_id TEXT NOT NULL,
    location_gid TEXT NOT NULL,
    
    -- Operation details
    action TEXT NOT NULL, -- 'receiving', 'transfer', 'refund', 'enforce_graded', 'initial_set', 'manual_adjust', 'cross_channel_zero'
    api_used TEXT NOT NULL, -- 'adjust' or 'set'
    
    -- Values
    delta INTEGER, -- For adjust operations
    set_value INTEGER, -- For set operations
    expected_available INTEGER, -- Optimistic locking value (if used)
    previous_available INTEGER, -- Value before operation
    new_available INTEGER, -- Value after operation
    
    -- Result
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    latency_ms INTEGER,
    
    -- Metadata
    source_function TEXT, -- Edge function name
    triggered_by TEXT -- user_id, webhook, system, etc.
);

-- Enable RLS
ALTER TABLE public.inventory_write_log ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can view logs
CREATE POLICY "Authenticated users can view inventory write logs"
ON public.inventory_write_log
FOR SELECT
USING (auth.role() = 'authenticated');

-- Indexes for common queries
CREATE INDEX idx_inventory_write_log_created_at ON public.inventory_write_log (created_at DESC);
CREATE INDEX idx_inventory_write_log_store_key ON public.inventory_write_log (store_key, created_at DESC);
CREATE INDEX idx_inventory_write_log_sku ON public.inventory_write_log (sku, created_at DESC);
CREATE INDEX idx_inventory_write_log_item_id ON public.inventory_write_log (item_id, created_at DESC);
CREATE INDEX idx_inventory_write_log_request_id ON public.inventory_write_log (request_id);
CREATE INDEX idx_inventory_write_log_failures ON public.inventory_write_log (success) WHERE success = false;

-- Add comment
COMMENT ON TABLE public.inventory_write_log IS 'Audit log of all Shopify inventory API writes for debugging and compliance';