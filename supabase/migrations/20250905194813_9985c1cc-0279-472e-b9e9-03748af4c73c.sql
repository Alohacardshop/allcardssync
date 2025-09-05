-- Fix the remaining Security Definer View issues in catalog_v2 schema

-- Drop the old view that references non-existent tables
DROP VIEW IF EXISTS catalog_v2.pending_sets_old_20250829;

-- Recreate the catalog_v2.stats view to remove security definer behavior
DROP VIEW IF EXISTS catalog_v2.stats;

CREATE VIEW catalog_v2.stats AS  
SELECT 
    s.game,
    COUNT(DISTINCT s.set_id) AS sets_count,
    COUNT(DISTINCT c.card_id) AS cards_count,
    0 AS pending_count
FROM catalog_v2.sets s
LEFT JOIN catalog_v2.cards c ON (c.set_provider_id = s.provider_id AND c.game = s.game)
GROUP BY s.game;

-- Add comment to document the security fix
COMMENT ON VIEW catalog_v2.stats IS 'Game catalog statistics - fixed security definer issue by recreating view';