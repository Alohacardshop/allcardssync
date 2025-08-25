-- Create print_jobs table for tracking print jobs
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workstation_id text NOT NULL,
  printer_name text,
  printer_id integer,
  tspl_code text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'completed', 'error')),
  error_message text,
  printnode_job_id integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- Create policies for print jobs
CREATE POLICY "Staff/Admin can view print_jobs" 
ON public.print_jobs 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can insert print_jobs" 
ON public.print_jobs 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can update print_jobs" 
ON public.print_jobs 
FOR UPDATE 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create printer_settings table for workstation configurations
CREATE TABLE IF NOT EXISTS public.printer_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  workstation_id text NOT NULL UNIQUE,
  selected_printer_id integer,
  selected_printer_name text,
  use_printnode boolean DEFAULT true,
  bridge_port integer DEFAULT 17777,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.printer_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for printer settings
CREATE POLICY "Staff/Admin can view printer_settings" 
ON public.printer_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can insert printer_settings" 
ON public.printer_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Staff/Admin can update printer_settings" 
ON public.printer_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add updated_at triggers
CREATE TRIGGER update_print_jobs_updated_at
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_printer_settings_updated_at
  BEFORE UPDATE ON public.printer_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();