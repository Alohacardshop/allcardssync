-- Add inventory_truth_mode to shopify_stores (defaults to 'shopify')
ALTER TABLE public.shopify_stores 
ADD COLUMN IF NOT EXISTS inventory_truth_mode text NOT NULL DEFAULT 'shopify' 
CHECK (inventory_truth_mode IN ('shopify', 'database'));

-- Add last_shopify_seen_at to intake_items for tracking when we last synced from Shopify
ALTER TABLE public.intake_items 
ADD COLUMN IF NOT EXISTS last_shopify_seen_at timestamp with time zone;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_intake_items_last_shopify_seen 
ON public.intake_items (last_shopify_seen_at) 
WHERE last_shopify_seen_at IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.shopify_stores.inventory_truth_mode IS 
'shopify = Shopify quantity updates flow to intake_items.quantity; database = local quantity is authoritative';