-- PHASE 1: CRITICAL SECURITY FIXES

-- Fix 1: Restrict label_settings access to authenticated staff only
DROP POLICY IF EXISTS "Label settings are accessible by workstation" ON public.label_settings;

CREATE POLICY "Staff can manage label settings"
  ON public.label_settings
  FOR ALL
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Restrict system_logs insertion to authenticated system processes
DROP POLICY IF EXISTS "System can insert logs" ON public.system_logs;

CREATE POLICY "Authenticated system can insert logs"
  ON public.system_logs
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Fix 3: Restrict edge_function_logs insertion to authenticated processes  
DROP POLICY IF EXISTS "System can insert edge function logs" ON public.edge_function_logs;

CREATE POLICY "Authenticated system can insert edge function logs"
  ON public.edge_function_logs  
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  );

-- Fix 4: Add search_path protection to remaining functions
-- (Most functions already have this, but let's ensure completeness)

-- Fix function that might be missing search_path
ALTER FUNCTION public.normalize_game_slug(text) SET search_path = 'public';
ALTER FUNCTION public.generate_lot_number() SET search_path = 'public';
ALTER FUNCTION public.has_role(uuid, app_role) SET search_path = 'public';

-- Fix 5: Restrict games table public access for competitive protection
DROP POLICY IF EXISTS "Public read access" ON public.games;

CREATE POLICY "Staff can view games"
  ON public.games
  FOR SELECT
  USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));