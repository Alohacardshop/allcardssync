-- Drop the old unique constraint that conflicts with the new mode-aware structure
ALTER TABLE public.sync_queue DROP CONSTRAINT IF EXISTS sync_queue_game_set_id_key;

-- Ensure we have the correct partial unique index for mode-aware queuing
-- This allows the same set_id to exist multiple times but only once per mode when status is queued or processing
DROP INDEX IF EXISTS idx_sync_queue_unique_active_mode;
CREATE UNIQUE INDEX idx_sync_queue_unique_active_mode 
ON public.sync_queue (mode, set_id) 
WHERE status IN ('queued', 'processing');

-- Add a non-unique index for general queries on game and set_id for performance
CREATE INDEX IF NOT EXISTS idx_sync_queue_game_set_id ON public.sync_queue (game, set_id);