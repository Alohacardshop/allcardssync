-- Add sold fields to intake_items
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS sold_price NUMERIC,
ADD COLUMN IF NOT EXISTS sold_order_id TEXT,
ADD COLUMN IF NOT EXISTS sold_channel TEXT,
ADD COLUMN IF NOT EXISTS sold_currency TEXT;