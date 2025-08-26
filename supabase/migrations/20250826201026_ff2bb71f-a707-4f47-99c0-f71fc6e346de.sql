-- Create sync_queue table for per-game catalog sync operations
CREATE TABLE public.sync_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game TEXT NOT NULL,
  set_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'done', 'error')),
  retries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Prevent duplicate entries for same game/set combination
  UNIQUE(game, set_id)
);

-- Enable RLS
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- Create policies for sync_queue
CREATE POLICY "Admins can view sync_queue" 
ON public.sync_queue 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sync_queue" 
ON public.sync_queue 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sync_queue" 
ON public.sync_queue 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sync_queue" 
ON public.sync_queue 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for efficient queue processing
CREATE INDEX idx_sync_queue_status_game ON public.sync_queue(status, game, created_at);

-- Create updated_at trigger
CREATE TRIGGER update_sync_queue_updated_at
  BEFORE UPDATE ON public.sync_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to queue pending sets for a specific game
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_pending_sets_to_queue(game_in text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    INSERT INTO public.sync_queue (game, set_id)
    VALUES (game_in, rec.set_id)
    ON CONFLICT (game, set_id) DO NOTHING;
    
    GET DIAGNOSTICS queued = ROW_COUNT;
    IF queued > 0 THEN
      queued := queued + 1;
    END IF;
  END LOOP;
  
  RETURN queued;
END
$function$;

-- Function to get next queue item for processing
CREATE OR REPLACE FUNCTION public.catalog_v2_get_next_queue_item(game_in text)
RETURNS TABLE(id uuid, game text, set_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH next_item AS (
    SELECT sq.id, sq.game, sq.set_id
    FROM public.sync_queue sq
    WHERE sq.game = game_in 
    AND sq.status = 'queued'
    ORDER BY sq.created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_queue sq
  SET status = 'processing', updated_at = now()
  FROM next_item ni
  WHERE sq.id = ni.id
  RETURNING sq.id, sq.game, sq.set_id;
$function$;

-- Function to mark queue item as done
CREATE OR REPLACE FUNCTION public.catalog_v2_mark_queue_item_done(item_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.sync_queue
  SET status = 'done', updated_at = now()
  WHERE id = item_id;
$function$;

-- Function to mark queue item as error with retry logic
CREATE OR REPLACE FUNCTION public.catalog_v2_mark_queue_item_error(item_id uuid, error_message text, max_retries integer DEFAULT 3)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.sync_queue
  SET 
    retries = retries + 1,
    last_error = error_message,
    status = CASE 
      WHEN retries + 1 >= max_retries THEN 'error'
      ELSE 'queued'
    END,
    updated_at = now()
  WHERE id = item_id;
END
$function$;

-- Function to get queue stats
CREATE OR REPLACE FUNCTION public.catalog_v2_queue_stats(game_in text)
RETURNS TABLE(queued bigint, processing bigint, done bigint, error bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    COALESCE(SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END), 0) as queued,
    COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0) as processing,
    COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) as done,
    COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) as error
  FROM public.sync_queue
  WHERE game = game_in;
$function$;