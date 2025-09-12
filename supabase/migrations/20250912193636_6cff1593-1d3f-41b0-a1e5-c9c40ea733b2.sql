-- Create label settings table for persistent printer and label configuration
CREATE TABLE public.label_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workstation_id TEXT NOT NULL UNIQUE,
  
  -- Printer settings
  printer_ip TEXT,
  printer_port INTEGER DEFAULT 9100,
  has_cutter BOOLEAN DEFAULT false,
  
  -- Print defaults
  dpi INTEGER DEFAULT 203,
  speed INTEGER DEFAULT 4,
  darkness INTEGER DEFAULT 10,
  copies INTEGER DEFAULT 1,
  cut_mode TEXT DEFAULT 'end-of-job' CHECK (cut_mode IN ('none', 'every-label', 'end-of-job')),
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.label_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for label settings (workstation-based access)
CREATE POLICY "Label settings are accessible by workstation" 
ON public.label_settings 
FOR ALL
USING (true)
WITH CHECK (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_label_settings_updated_at
BEFORE UPDATE ON public.label_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for efficient workstation lookups
CREATE INDEX idx_label_settings_workstation_id ON public.label_settings(workstation_id);