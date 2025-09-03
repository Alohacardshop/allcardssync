-- Fix remaining critical security issues

-- Drop and recreate views without SECURITY DEFINER to respect caller's RLS
DROP VIEW IF EXISTS public.game_catalog_stats;
DROP VIEW IF EXISTS public.group_sync_status;

-- Recreate without SECURITY DEFINER (default is SECURITY INVOKER)
CREATE VIEW public.game_catalog_stats AS
SELECT g.id AS game_id,
    g.name AS game_name,
    COALESCE(count(DISTINCT s.set_id), (0)::bigint) AS sets_count,
    COALESCE(count(DISTINCT c.card_id), (0)::bigint) AS cards_count
FROM ((games g
     LEFT JOIN catalog_v2.sets_old_20250829 s ON (((s.game = g.id) AND (s.provider = 'justtcg'::text))))
     LEFT JOIN catalog_v2.cards_old_20250829 c ON (((c.game = g.id) AND (c.provider = 'justtcg'::text))))
GROUP BY g.id, g.name;

CREATE VIEW public.group_sync_status AS
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

-- Set ownership and permissions to respect RLS on underlying tables
ALTER VIEW public.game_catalog_stats OWNER TO postgres;
ALTER VIEW public.group_sync_status OWNER TO postgres;

-- Grant select permissions only to authenticated users (RLS on underlying tables will control access)
GRANT SELECT ON public.game_catalog_stats TO authenticated;
GRANT SELECT ON public.group_sync_status TO authenticated;

-- Enable RLS on the views themselves
ALTER VIEW public.game_catalog_stats SET (security_barrier = true);
ALTER VIEW public.group_sync_status SET (security_barrier = true);

-- Create RLS policies for the views to ensure staff/admin access only
CREATE POLICY "Staff/Admin can view game catalog stats"
ON public.game_catalog_stats
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can view group sync status"
ON public.group_sync_status
FOR SELECT  
TO authenticated
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Ensure games table has no public access
DROP POLICY IF EXISTS "Public read access" ON public.games;

-- Fix remaining functions with search_path issues
CREATE OR REPLACE FUNCTION public.trigger_shopify_inventory_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  sync_payload jsonb;
begin
  if tg_op = 'DELETE' then
    if old.sku is not null and old.store_key is not null then
      sync_payload := jsonb_build_object(
        'storeKey', old.store_key,
        'sku', old.sku,
        'locationGid', old.shopify_location_gid
      );
      begin
        perform public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      exception when others then
        -- Do not block the main transaction on network errors
        raise notice 'Shopify sync dispatch failed (DELETE): %', SQLERRM;
      end;
    end if;
    return old;

  else
    if new.sku is not null and new.store_key is not null and (
      tg_op = 'INSERT' or
      old.sku is distinct from new.sku or
      old.quantity is distinct from new.quantity or
      old.deleted_at is distinct from new.deleted_at or
      old.removed_from_batch_at is distinct from new.removed_from_batch_at or
      old.store_key is distinct from new.store_key or
      old.shopify_location_gid is distinct from new.shopify_location_gid
    ) then

      -- Sync the new SKU
      sync_payload := jsonb_build_object(
        'storeKey', new.store_key,
        'sku', new.sku,
        'locationGid', new.shopify_location_gid
      );
      begin
        perform public.http_post_async(
          url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body    := sync_payload
        );
      exception when others then
        raise notice 'Shopify sync dispatch failed (UPSERT new): %', SQLERRM;
      end;

      -- If SKU changed on UPDATE, also sync the old SKU
      if tg_op = 'UPDATE' and old.sku is distinct from new.sku and old.sku is not null then
        sync_payload := jsonb_build_object(
          'storeKey', old.store_key,
          'sku', old.sku,
          'locationGid', old.shopify_location_gid
        );
        begin
          perform public.http_post_async(
            url     := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/shopify-sync-inventory',
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body    := sync_payload
          );
        exception when others then
          raise notice 'Shopify sync dispatch failed (UPSERT old sku): %', SQLERRM;
        end;
      end if;
    end if;

    return new;
  end if;
end;
$function$;