-- Remove the trigger that causes Shopify sync on intake_items insert/update
-- This trigger is causing timeouts when adding items to batch
DROP TRIGGER IF EXISTS intake_items_shopify_sync ON intake_items;

-- We'll handle Shopify sync from the frontend instead for better user experience