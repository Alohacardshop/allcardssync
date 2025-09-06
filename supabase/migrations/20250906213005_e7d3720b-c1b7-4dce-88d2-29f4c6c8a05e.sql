-- Add system setting to control automatic Shopify sync
INSERT INTO system_settings (key_name, key_value, description, category)
VALUES ('INVENTORY_SYNC_MODE', 'manual', 'Control when inventory syncs to Shopify: auto or manual', 'inventory')
ON CONFLICT (key_name) DO NOTHING;

-- Add new columns to track Shopify sync status
ALTER TABLE intake_items 
ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_shopify_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS last_shopify_sync_error TEXT;