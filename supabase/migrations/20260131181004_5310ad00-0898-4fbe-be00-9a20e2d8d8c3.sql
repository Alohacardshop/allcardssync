-- Add region_id column to pending_notifications for regional Discord routing
ALTER TABLE pending_notifications 
ADD COLUMN IF NOT EXISTS region_id text DEFAULT 'hawaii';

-- Create index for efficient querying by region and status
CREATE INDEX IF NOT EXISTS idx_pending_notifications_region_sent 
ON pending_notifications (region_id, sent) 
WHERE sent = false;

-- Backfill existing rows with detected region or default to 'hawaii'
-- (All existing rows will have 'hawaii' as default)