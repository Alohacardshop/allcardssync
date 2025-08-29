-- CRITICAL SECURITY FIXES (Fixed)

-- 1. Remove public read access from sensitive business data
DROP POLICY IF EXISTS "Public read access" ON public.games;
DROP POLICY IF EXISTS "Public read access for sets" ON public.sets;

-- Replace with staff/admin only access
CREATE POLICY "Staff/Admin can view games" ON public.games
FOR SELECT USING (
  has_role(auth.uid(), 'staff'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Staff/Admin can view sets" ON public.sets  
FOR SELECT USING (
  has_role(auth.uid(), 'staff'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- 2. Secure staging tables with RLS
ALTER TABLE catalog_v2.sets_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_v2.cards_new ENABLE ROW LEVEL SECURITY; 
ALTER TABLE catalog_v2.variants_new ENABLE ROW LEVEL SECURITY;

-- Admin-only access to staging tables
CREATE POLICY "Admin only access to sets_new" ON catalog_v2.sets_new
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin only access to cards_new" ON catalog_v2.cards_new  
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admin only access to variants_new" ON catalog_v2.variants_new
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- 3. Remove public access to label templates
DROP POLICY IF EXISTS "Anyone can view label_templates_new" ON public.label_templates_new;

-- Replace with staff/admin only
CREATE POLICY "Staff/Admin can view label_templates_new" ON public.label_templates_new
FOR SELECT USING (
  has_role(auth.uid(), 'staff'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- 4. Add missing RLS to sync_v3 schema if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'sync_v3') THEN
    -- Enable RLS on sync_v3 tables if they exist
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'sync_v3' AND table_name = 'jobs') THEN
      ALTER TABLE sync_v3.jobs ENABLE ROW LEVEL SECURITY;
      
      -- Admin-only access to sync jobs
      CREATE POLICY "Admin only access to sync jobs" ON sync_v3.jobs
      FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
    END IF;
  END IF;
END $$;