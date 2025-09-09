-- Add new fields for Shopify removal tracking
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS shopify_removed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS shopify_removal_mode TEXT,
ADD COLUMN IF NOT EXISTS last_shopify_removal_error TEXT;

-- Add webhook events table for idempotency
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on webhook_events
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Create policy for webhook_events (admins only)
CREATE POLICY "Admins can manage webhook_events" ON public.webhook_events 
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add SHOPIFY_REMOVAL_STRATEGY system setting
INSERT INTO public.system_settings (key_name, key_value, description, category)
VALUES ('SHOPIFY_REMOVAL_STRATEGY', 'delete', 'Shopify removal strategy: delete, zero, or auto', 'shopify')
ON CONFLICT (key_name) DO UPDATE SET 
  key_value = EXCLUDED.key_value,
  description = EXCLUDED.description,
  category = EXCLUDED.category;