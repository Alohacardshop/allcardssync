-- Create system_logs table for comprehensive application logging
CREATE TABLE public.system_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level text NOT NULL CHECK (level IN ('error', 'warn', 'info', 'debug')),
  message text NOT NULL,
  context jsonb DEFAULT NULL,
  source text DEFAULT NULL, -- component, function, or module that generated the log
  user_id uuid DEFAULT NULL, -- user who triggered the action (if applicable)
  error_details jsonb DEFAULT NULL, -- stack trace, error code, etc.
  metadata jsonb DEFAULT NULL, -- additional contextual data
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for system_logs
CREATE POLICY "Admins can view all system logs"
  ON public.system_logs
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can insert logs"
  ON public.system_logs
  FOR INSERT
  WITH CHECK (true); -- Allow system to log from anywhere

CREATE POLICY "Admins can delete old logs"
  ON public.system_logs
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for better performance
CREATE INDEX idx_system_logs_created_at ON public.system_logs(created_at DESC);
CREATE INDEX idx_system_logs_level ON public.system_logs(level);
CREATE INDEX idx_system_logs_source ON public.system_logs(source);

-- Create function to add system log
CREATE OR REPLACE FUNCTION public.add_system_log(
  level_in text,
  message_in text,
  context_in jsonb DEFAULT NULL,
  source_in text DEFAULT NULL,
  user_id_in uuid DEFAULT NULL,
  error_details_in jsonb DEFAULT NULL,
  metadata_in jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  log_id uuid;
BEGIN
  INSERT INTO public.system_logs (
    level, message, context, source, user_id, error_details, metadata
  ) VALUES (
    level_in, message_in, context_in, source_in, 
    COALESCE(user_id_in, auth.uid()), error_details_in, metadata_in
  ) RETURNING id INTO log_id;
  
  RETURN log_id;
END;
$$;