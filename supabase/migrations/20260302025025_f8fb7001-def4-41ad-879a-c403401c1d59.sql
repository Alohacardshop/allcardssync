
-- Clean slate: Delete all intake/transfer/sync data
-- Preserves all eBay and Shopify configuration tables

-- Delete all dependent tables first (FK order)
TRUNCATE TABLE ebay_sync_queue CASCADE;
TRUNCATE TABLE item_snapshots CASCADE;
TRUNCATE TABLE cross_region_transfer_items CASCADE;
TRUNCATE TABLE cross_region_transfer_requests CASCADE;
TRUNCATE TABLE location_transfer_items CASCADE;
TRUNCATE TABLE location_transfers CASCADE;
TRUNCATE TABLE inventory_reconciliation_queue CASCADE;
TRUNCATE TABLE inventory_write_log CASCADE;
TRUNCATE TABLE intake_items CASCADE;
TRUNCATE TABLE intake_lots CASCADE;
