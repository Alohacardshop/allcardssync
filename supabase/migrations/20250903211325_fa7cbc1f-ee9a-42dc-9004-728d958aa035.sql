-- Fix remaining critical security issues (corrected approach)

-- Drop and recreate views with security_barrier enabled
DROP VIEW IF EXISTS public.game_catalog_stats;
DROP VIEW IF EXISTS public.group_sync_status;

-- Recreate with security_barrier to ensure RLS is properly checked on underlying tables
CREATE VIEW public.game_catalog_stats 
WITH (security_barrier=true) AS
SELECT g.id AS game_id,
    g.name AS game_name,
    COALESCE(count(DISTINCT s.set_id), (0)::bigint) AS sets_count,
    COALESCE(count(DISTINCT c.card_id), (0)::bigint) AS cards_count
FROM ((games g
     LEFT JOIN catalog_v2.sets_old_20250829 s ON (((s.game = g.id) AND (s.provider = 'justtcg'::text))))
     LEFT JOIN catalog_v2.cards_old_20250829 c ON (((c.game = g.id) AND (c.provider = 'justtcg'::text))))
GROUP BY g.id, g.name;

CREATE VIEW public.group_sync_status
WITH (security_barrier=true) AS
SELECT g.id,
    g.name,
    g.category_id,
    COALESCE(p.total_products, (0)::bigint) AS total_products,
    COALESCE(p.synced_products, (0)::bigint) AS synced_products,
    CASE
        WHEN (COALESCE(p.total_products, (0)::bigint) = 0) THEN false
        ELSE (COALESCE(p.synced_products, (0)::bigint) = COALESCE(p.total_products, (0)::bigint))
    END AS is_fully_synced
FROM (groups g
     LEFT JOIN ( SELECT prod.group_id,
            count(*) AS total_products,
            count(
                CASE
                    WHEN (ps.sync_status = 'synced'::sync_status) THEN 1
                    ELSE NULL::integer
                END) AS synced_products
           FROM (products prod
             LEFT JOIN product_sync_status ps ON ((prod.id = ps.product_id)))
          GROUP BY prod.group_id) p ON ((g.id = p.group_id)));

-- Set ownership and permissions - views will respect RLS on underlying tables due to security_barrier
ALTER VIEW public.game_catalog_stats OWNER TO postgres;
ALTER VIEW public.group_sync_status OWNER TO postgres;

-- Grant select permissions only to authenticated users
GRANT SELECT ON public.game_catalog_stats TO authenticated;
GRANT SELECT ON public.group_sync_status TO authenticated;

-- Remove any public access to views
REVOKE SELECT ON public.game_catalog_stats FROM public;
REVOKE SELECT ON public.group_sync_status FROM public;

-- Ensure games table has no public access - this should work now
DROP POLICY IF EXISTS "Public read access" ON public.games;