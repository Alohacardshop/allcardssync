-- Create shopify_sync_queue table
CREATE TABLE public.shopify_sync_queue (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    inventory_item_id UUID NOT NULL REFERENCES public.intake_items(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    shopify_product_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Create index for efficient queue processing
CREATE INDEX idx_shopify_sync_queue_processing ON public.shopify_sync_queue (status, created_at) 
WHERE status = 'queued' OR status = 'processing';

-- Enable RLS
ALTER TABLE public.shopify_sync_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can read sync queue" 
ON public.shopify_sync_queue 
FOR SELECT 
USING (auth.uid() IS NOT NULL AND (
  has_role(auth.uid(), 'staff'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
));

CREATE POLICY "Service role can manage sync queue" 
ON public.shopify_sync_queue 
FOR ALL 
USING (auth.role() = 'service_role');

CREATE POLICY "System can insert into sync queue" 
ON public.shopify_sync_queue 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "System can update sync queue" 
ON public.shopify_sync_queue 
FOR UPDATE 
USING (true);

-- Function to add items to sync queue
CREATE OR REPLACE FUNCTION public.queue_shopify_sync(
  item_id UUID,
  sync_action VARCHAR DEFAULT 'create'
) RETURNS UUID AS $$
DECLARE
  queue_id UUID;
BEGIN
  INSERT INTO public.shopify_sync_queue (
    inventory_item_id,
    action,
    status
  ) VALUES (
    item_id,
    sync_action,
    'queued'
  ) RETURNING id INTO queue_id;
  
  RETURN queue_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;