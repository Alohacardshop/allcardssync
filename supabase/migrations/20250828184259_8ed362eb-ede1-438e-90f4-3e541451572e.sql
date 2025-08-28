-- Create helper view to identify pending sets per game
CREATE OR REPLACE VIEW catalog_v2.pending_sets AS
SELECT s.game, s.set_id, s.name, s.release_date
FROM catalog_v2.sets s
LEFT JOIN (
  SELECT DISTINCT game, set_id FROM catalog_v2.cards
) c ON c.game = s.game AND c.set_id = s.set_id
WHERE c.set_id IS NULL;

-- Grant access to the view
GRANT SELECT ON catalog_v2.pending_sets TO authenticator;
GRANT SELECT ON catalog_v2.pending_sets TO anon;
GRANT SELECT ON catalog_v2.pending_sets TO authenticated;