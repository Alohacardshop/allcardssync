-- Add performance indexes for bulk transfer system
-- Note: Removing CONCURRENTLY as it cannot run in transactions

-- Index for location_transfers: frequently queried by created_by and store_key
CREATE INDEX IF NOT EXISTS idx_location_transfers_created_by 
ON location_transfers(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_location_transfers_store_key 
ON location_transfers(store_key, created_at DESC);

-- Index for location_transfer_items: frequently joined by transfer_id
CREATE INDEX IF NOT EXISTS idx_location_transfer_items_transfer_id 
ON location_transfer_items(transfer_id, status);

-- Index for faster lookups by status
CREATE INDEX IF NOT EXISTS idx_location_transfers_status 
ON location_transfers(status, created_at DESC) 
WHERE status IN ('pending', 'processing');

-- Index for intake_items barcode lookups (sku, lot_number, unique_item_uid)
CREATE INDEX IF NOT EXISTS idx_intake_items_sku_inventory 
ON intake_items(sku) 
WHERE deleted_at IS NULL AND removed_from_batch_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_lot_number_inventory 
ON intake_items(lot_number) 
WHERE deleted_at IS NULL AND removed_from_batch_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intake_items_unique_uid_inventory 
ON intake_items(unique_item_uid) 
WHERE deleted_at IS NULL AND removed_from_batch_at IS NOT NULL;