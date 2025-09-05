-- Alternative approach: Convert problematic views to SECURITY INVOKER functions
-- This removes the security definer behavior while maintaining functionality

-- Drop the existing views
DROP VIEW IF EXISTS public.game_catalog_stats CASCADE;
DROP VIEW IF EXISTS public.group_sync_status CASCADE;
DROP VIEW IF EXISTS catalog_v2.stats CASCADE;

-- Create SECURITY INVOKER functions instead of views
-- These will run with the caller's permissions, not the function owner's

CREATE OR REPLACE FUNCTION public.get_game_catalog_stats()
RETURNS TABLE(game_id text, game_name text, sets_count bigint, cards_count bigint)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
    SELECT 
        g.id AS game_id,
        g.name AS game_name,
        COALESCE(COUNT(DISTINCT s.set_id), 0)::bigint AS sets_count,
        COALESCE(COUNT(DISTINCT c.card_id), 0)::bigint AS cards_count
    FROM games g
    LEFT JOIN catalog_v2.sets s ON (s.game = g.id)
    LEFT JOIN catalog_v2.cards c ON (c.game = g.id)
    GROUP BY g.id, g.name;
$$;

CREATE OR REPLACE FUNCTION public.get_group_sync_status()
RETURNS TABLE(id integer, name text, category_id integer, total_products bigint, synced_products bigint, is_fully_synced boolean)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION catalog_v2.get_stats()
RETURNS TABLE(game text, sets_count bigint, cards_count bigint, pending_count integer)
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
    SELECT 
        s.game,
        COUNT(DISTINCT s.set_id) AS sets_count,
        COUNT(DISTINCT c.card_id) AS cards_count,
        0 AS pending_count
    FROM catalog_v2.sets s
    LEFT JOIN catalog_v2.cards c ON (c.set_provider_id = s.provider_id AND c.game = s.game)
    GROUP BY s.game;
$$;

-- Add comments documenting the security fix
COMMENT ON FUNCTION public.get_game_catalog_stats() IS 'Game catalog statistics - converted from view to SECURITY INVOKER function to fix security definer issue';
COMMENT ON FUNCTION public.get_group_sync_status() IS 'Product group sync status - converted from view to SECURITY INVOKER function to fix security definer issue';
COMMENT ON FUNCTION catalog_v2.get_stats() IS 'Catalog statistics - converted from view to SECURITY INVOKER function to fix security definer issue';