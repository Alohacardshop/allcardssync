-- Create games table for JustTCG integration
CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,          -- e.g. "magic-the-gathering", "pokemon", etc. (from API)
  name TEXT NOT NULL,
  raw JSONB,
  discovered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admins can manage games" ON games
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff can view games" ON games
FOR SELECT USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Drop view if exists and recreate
DROP VIEW IF EXISTS game_catalog_stats;

-- Create view for game catalog stats
CREATE VIEW game_catalog_stats AS
SELECT
  g.id AS game_id,
  g.name AS game_name,
  COALESCE(COUNT(DISTINCT s.set_id), 0) AS sets_count,
  COALESCE(COUNT(DISTINCT c.card_id), 0) AS cards_count
FROM games g
LEFT JOIN catalog_v2.sets s ON s.game = g.id AND s.provider = 'justtcg'
LEFT JOIN catalog_v2.cards c ON c.game = g.id AND c.provider = 'justtcg'
GROUP BY g.id, g.name;