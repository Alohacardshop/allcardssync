-- Remove legacy IP/port columns no longer used with QZ Tray

-- user_printer_preferences: Remove IP-based printer config
ALTER TABLE public.user_printer_preferences 
  DROP COLUMN IF EXISTS printer_ip,
  DROP COLUMN IF EXISTS printer_port,
  DROP COLUMN IF EXISTS printer_id;

-- printer_settings: Remove all legacy bridge/PrintNode columns
ALTER TABLE public.printer_settings 
  DROP COLUMN IF EXISTS printer_ip,
  DROP COLUMN IF EXISTS printer_port,
  DROP COLUMN IF EXISTS bridge_port,
  DROP COLUMN IF EXISTS use_printnode,
  DROP COLUMN IF EXISTS selected_printer_id;

-- label_settings: Remove IP-based printer config  
ALTER TABLE public.label_settings 
  DROP COLUMN IF EXISTS printer_ip,
  DROP COLUMN IF EXISTS printer_port;