-- Fix Security Definer View issue by changing ownership of views
-- Views owned by postgres superuser automatically have SECURITY DEFINER behavior
-- Change ownership to authenticated role to remove this behavior

-- First, let's change ownership of the public schema views
ALTER VIEW public.game_catalog_stats OWNER TO authenticated;
ALTER VIEW public.group_sync_status OWNER TO authenticated;

-- Also change ownership of the catalog_v2.stats view 
ALTER VIEW catalog_v2.stats OWNER TO authenticated;

-- Add comments to document the security fix
COMMENT ON VIEW public.game_catalog_stats IS 'Game catalog statistics - fixed security definer by changing owner from postgres to authenticated';
COMMENT ON VIEW public.group_sync_status IS 'Product group sync status - fixed security definer by changing owner from postgres to authenticated';  
COMMENT ON VIEW catalog_v2.stats IS 'Catalog statistics - fixed security definer by changing owner from postgres to authenticated';