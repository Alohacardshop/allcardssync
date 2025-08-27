-- JustTCG analytics and watchlist tables

-- Watchlist for nightly snapshots
CREATE TABLE IF NOT EXISTS public.justtcg_watchlist (
  id bigserial PRIMARY KEY,
  game text NOT NULL,
  card_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (game, card_id)
);

-- Analytics snapshots for historical tracking
CREATE TABLE IF NOT EXISTS public.justtcg_analytics_snapshots (
  id bigserial PRIMARY KEY,
  captured_at timestamptz NOT NULL DEFAULT now(),
  game text NOT NULL,
  card_id text NOT NULL,
  card_name text,
  cheapest_price numeric,
  change_24h numeric,
  change_7d numeric,
  change_30d numeric,
  raw jsonb
);

-- Create index for efficient queries
CREATE INDEX IF NOT EXISTS idx_analytics_game_time 
ON public.justtcg_analytics_snapshots (game, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_card_time 
ON public.justtcg_analytics_snapshots (card_id, captured_at DESC);

-- RLS policies for security
ALTER TABLE public.justtcg_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.justtcg_analytics_snapshots ENABLE ROW LEVEL SECURITY;

-- Admin-only access for watchlist
CREATE POLICY "Admins can manage watchlist" ON public.justtcg_watchlist
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Admin can read/write snapshots, staff can read
CREATE POLICY "Admins can manage snapshots" ON public.justtcg_analytics_snapshots
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view snapshots" ON public.justtcg_analytics_snapshots
  FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add some sample watchlist entries for testing
INSERT INTO public.justtcg_watchlist (game, card_id) VALUES
  ('magic-the-gathering', 'mtg-card-1'),
  ('magic-the-gathering', 'mtg-card-2'),
  ('pokemon', 'pokemon-card-1'),
  ('pokemon', 'pokemon-card-2'),
  ('pokemon-japan', 'pokemon-jp-card-1')
ON CONFLICT (game, card_id) DO NOTHING;

-- Set up cron job for nightly snapshots (runs at 3:15 AM UTC daily)
SELECT cron.schedule(
  'justtcg-nightly-snapshots',
  '15 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-snapshots',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDQwNTk0MywiZXhwIjoyMDY5OTgxOTQzfQ.GT_nZC5BIAXEt2lDBFLPqG3H3bQ8_zqT1VsRDO7JGTE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);