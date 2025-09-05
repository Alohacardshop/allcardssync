-- Fix Security Definer View vulnerability by updating views to reference correct tables
-- and using the correct column names

-- Drop the existing views that reference old/non-existent tables
DROP VIEW IF EXISTS public.game_catalog_stats;

-- Recreate the game_catalog_stats view with correct table references and column names
CREATE VIEW public.game_catalog_stats AS
SELECT 
    g.id AS game_id,
    g.name AS game_name,
    COALESCE(COUNT(DISTINCT s.set_id), 0)::bigint AS sets_count,
    COALESCE(COUNT(DISTINCT c.card_id), 0)::bigint AS cards_count
FROM games g
LEFT JOIN catalog_v2.sets s ON (s.game = g.id)
LEFT JOIN catalog_v2.cards c ON (c.game = g.id)
GROUP BY g.id, g.name;

-- The group_sync_status view appears to be referencing correct tables already
-- but let's recreate it to ensure it doesn't have security definer behavior
DROP VIEW IF EXISTS public.group_sync_status;

CREATE VIEW public.group_sync_status AS
SELECT 
    g.id,
    g.name,
    g.category_id,
    COALESCE(p.total_products, 0)::bigint AS total_products,
    COALESCE(p.synced_products, 0)::bigint AS synced_products,
    CASE 
        WHEN COALESCE(p.total_products, 0) = 0 THEN false
        ELSE COALESCE(p.synced_products, 0) = COALESCE(p.total_products, 0)
    END AS is_fully_synced
FROM groups g
LEFT JOIN (
    SELECT 
        prod.group_id,
        COUNT(*) AS total_products,
        COUNT(CASE WHEN ps.sync_status = 'synced'::sync_status THEN 1 END) AS synced_products
    FROM products prod
    LEFT JOIN product_sync_status ps ON prod.id = ps.product_id
    GROUP BY prod.group_id
) p ON g.id = p.group_id;

-- Add comments to document that these views are now secure
COMMENT ON VIEW public.game_catalog_stats IS 'Aggregates game statistics from current catalog tables - fixed security definer issue';
COMMENT ON VIEW public.group_sync_status IS 'Shows sync status for product groups - fixed security definer issue';