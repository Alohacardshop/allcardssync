-- Additional database optimizations after sync removal
-- Clean up any remaining sync-related functions and improve performance

-- Drop any remaining sync-related functions
DROP FUNCTION IF EXISTS public.get_recent_sync_jobs(integer);
DROP FUNCTION IF EXISTS public.cancel_sync_job(uuid);
DROP FUNCTION IF EXISTS public.manage_justtcg_cron_jobs(text);

-- Optimize catalog_v2 tables with better indexes for inventory management
CREATE INDEX IF NOT EXISTS idx_catalog_v2_sets_game_name ON catalog_v2.sets(game, name);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_game_set_name ON catalog_v2.cards(game, set_id, name);
CREATE INDEX IF NOT EXISTS idx_catalog_v2_cards_search ON catalog_v2.cards USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_intake_items_active ON public.intake_items(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intake_items_status ON public.intake_items(printed_at, pushed_at) WHERE deleted_at IS NULL;

-- Add audit logging for business operations
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  table_name text NOT NULL,
  record_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Create audit log policies
CREATE POLICY "Admins can view all audit logs" ON public.audit_log
  FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (true);

-- Add indexes for audit log performance
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_created ON public.audit_log(table_name, created_at DESC);

-- Create audit trigger function
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS trigger AS $$
DECLARE
  old_data jsonb := NULL;
  new_data jsonb := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    old_data := row_to_json(OLD);
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, (OLD.id)::text, old_data);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := row_to_json(OLD);
    new_data := row_to_json(NEW);
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, old_data, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, (NEW.id)::text, old_data, new_data);
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    new_data := row_to_json(NEW);
    INSERT INTO public.audit_log (user_id, action, table_name, record_id, new_data)
    VALUES (auth.uid(), TG_OP, TG_TABLE_NAME, (NEW.id)::text, new_data);
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add audit triggers to important business tables
DROP TRIGGER IF EXISTS audit_intake_items ON public.intake_items;
CREATE TRIGGER audit_intake_items
  AFTER INSERT OR UPDATE OR DELETE ON public.intake_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_shopify_stores ON public.shopify_stores;  
CREATE TRIGGER audit_shopify_stores
  AFTER INSERT OR UPDATE OR DELETE ON public.shopify_stores
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Improve print job management
CREATE INDEX IF NOT EXISTS idx_print_jobs_status_created ON public.print_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_workstation ON public.print_jobs(workstation_id, status);

-- Clean up any orphaned data
DELETE FROM public.system_settings WHERE key_name LIKE '%JUSTTCG%' OR key_name LIKE '%sync%';

-- Add system health monitoring
INSERT INTO public.system_settings (key_name, key_value, description, category)
VALUES 
  ('EXTERNAL_TCG_API_URL', '', 'URL for external TCG database service', 'integration'),
  ('SYSTEM_MAINTENANCE_MODE', 'false', 'Enable maintenance mode', 'system'),
  ('MAX_BATCH_SIZE', '100', 'Maximum batch size for operations', 'performance')
ON CONFLICT (key_name) DO UPDATE SET
  key_value = EXCLUDED.key_value,
  description = EXCLUDED.description;