-- Add shopify sync audit columns to intake_items if missing
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS shopify_sync_snapshot jsonb,
ADD COLUMN IF NOT EXISTS shopify_sync_status text DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_shopify_synced_at timestamptz,
ADD COLUMN IF NOT EXISTS last_shopify_correlation_id text,
ADD COLUMN IF NOT EXISTS last_shopify_location_gid text,
ADD COLUMN IF NOT EXISTS last_shopify_store_key text;