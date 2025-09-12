-- Add network printer support to printer_settings table
ALTER TABLE printer_settings 
ADD COLUMN IF NOT EXISTS printer_ip TEXT,
ADD COLUMN IF NOT EXISTS printer_port INTEGER DEFAULT 9100,
ADD COLUMN IF NOT EXISTS printer_name TEXT;