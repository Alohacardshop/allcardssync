-- Simplified database cleanup and optimization
-- Remove sync-related functions and add audit logging

-- Drop remaining sync-related functions  
DROP FUNCTION IF EXISTS public.get_recent_sync_jobs(integer);
DROP FUNCTION IF EXISTS public.cancel_sync_job(uuid);
DROP FUNCTION IF EXISTS public.manage_justtcg_cron_jobs(text);

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

-- Add performance indexes
CREATE INDEX IF NOT EXISTS idx_intake_items_active ON public.intake_items(created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_intake_items_status ON public.intake_items(printed_at, pushed_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_print_jobs_status_created ON public.print_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_workstation ON public.print_jobs(workstation_id, status);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON public.audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_table_created ON public.audit_log(table_name, created_at DESC);

-- Clean up sync-related settings
DELETE FROM public.system_settings WHERE key_name LIKE '%JUSTTCG%' OR key_name LIKE '%sync%';

-- Add system configuration
INSERT INTO public.system_settings (key_name, key_value, description, category)
VALUES 
  ('EXTERNAL_TCG_API_URL', '', 'URL for external TCG database service', 'integration'),
  ('SYSTEM_MAINTENANCE_MODE', 'false', 'Enable maintenance mode', 'system'),
  ('MAX_BATCH_SIZE', '100', 'Maximum batch size for operations', 'performance')
ON CONFLICT (key_name) DO UPDATE SET
  key_value = EXCLUDED.key_value,
  description = EXCLUDED.description;