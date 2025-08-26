-- Add mode column to sync_queue table
ALTER TABLE public.sync_queue ADD COLUMN mode text;

-- Populate existing rows with mode based on game
UPDATE public.sync_queue 
SET mode = CASE 
  WHEN game = 'mtg' THEN 'mtg'
  WHEN game = 'pokemon' THEN 'pokemon-all'
  ELSE game
END
WHERE mode IS NULL;

-- Make mode column NOT NULL now that we've populated it
ALTER TABLE public.sync_queue ALTER COLUMN mode SET NOT NULL;

-- Create unique constraint to prevent duplicates for active items
-- Only one queued or processing item per (mode, set_id)
CREATE UNIQUE INDEX CONCURRENTLY idx_sync_queue_unique_active
ON public.sync_queue (mode, set_id)
WHERE status IN ('queued', 'processing');

-- Update existing database functions to work with modes

-- Updated function to get next queue item by mode
CREATE OR REPLACE FUNCTION public.catalog_v2_get_next_queue_item_by_mode(mode_in text)
RETURNS TABLE(id uuid, mode text, game text, set_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH next_item AS (
    SELECT sq.id, sq.mode, sq.game, sq.set_id
    FROM public.sync_queue sq
    WHERE sq.mode = mode_in 
    AND sq.status = 'queued'
    ORDER BY sq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_queue sq
  SET status = 'processing', updated_at = now()
  FROM next_item ni
  WHERE sq.id = ni.id
  RETURNING sq.id, sq.mode, sq.game, sq.set_id;
$$;

-- Function to queue pending sets for a specific mode
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_by_mode(
  mode_in text, 
  game_in text, 
  filter_japanese boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE 
  rec record; 
  queued int := 0;
BEGIN
  FOR rec IN
    SELECT s.set_id
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON c.set_id = s.set_id AND c.game = game_in
    WHERE s.game = game_in
    GROUP BY s.set_id
    HAVING count(c.id) = 0
  LOOP
    INSERT INTO public.sync_queue (mode, game, set_id)
    VALUES (mode_in, game_in, rec.set_id)
    ON CONFLICT (mode, set_id) 
    WHERE status IN ('queued', 'processing') 
    DO NOTHING;
    
    -- Check if we actually inserted a row
    IF FOUND THEN
      queued := queued + 1;
    END IF;
  END LOOP;
  
  RETURN queued;
END
$$;

-- Function to get queue stats by mode
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_stats_by_mode(mode_in text)
RETURNS TABLE(queued bigint, processing bigint, done bigint, error bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) as queued,
    COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) as processing,
    COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) as done,
    COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error
  FROM public.sync_queue
  WHERE mode = mode_in;
$$;