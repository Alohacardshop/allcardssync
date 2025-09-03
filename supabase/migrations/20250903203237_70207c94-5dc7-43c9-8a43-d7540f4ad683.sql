-- Enable RLS on tables that lack access controls
ALTER TABLE public.game_catalog_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_sync_status ENABLE ROW LEVEL SECURITY;

-- Add RLS policies for game_catalog_stats (business intelligence data)
CREATE POLICY "Staff/Admin can view game catalog stats" 
ON public.game_catalog_stats 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add RLS policies for group_sync_status (sync status data)  
CREATE POLICY "Staff/Admin can view group sync status" 
ON public.group_sync_status 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin can manage group sync status" 
ON public.group_sync_status 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));