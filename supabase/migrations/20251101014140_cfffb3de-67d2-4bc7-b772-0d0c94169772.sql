-- Prevent duplicate sync queue entries for the same item
-- Only one active (queued or processing) entry per inventory_item_id allowed
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_queue_active_item 
ON shopify_sync_queue(inventory_item_id) 
WHERE status IN ('queued', 'processing');

-- Add index for faster status+date lookups
CREATE INDEX IF NOT EXISTS idx_sync_queue_status_created 
ON shopify_sync_queue(status, created_at) 
WHERE status IN ('queued', 'processing', 'failed');

-- Add index for error monitoring
CREATE INDEX IF NOT EXISTS idx_sync_queue_errors 
ON shopify_sync_queue(error_message) 
WHERE error_message IS NOT NULL;

COMMENT ON INDEX idx_sync_queue_active_item IS 'Prevents duplicate queue entries for the same item while queued or processing';
COMMENT ON INDEX idx_sync_queue_status_created IS 'Improves performance for status-based queries';
COMMENT ON INDEX idx_sync_queue_errors IS 'Enables faster error monitoring and debugging';