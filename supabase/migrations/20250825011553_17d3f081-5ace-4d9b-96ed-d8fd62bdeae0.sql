-- Create table for storing API keys and system settings
CREATE TABLE public.system_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  key_name text NOT NULL UNIQUE,
  key_value text,
  description text,
  is_encrypted boolean DEFAULT true,
  category text DEFAULT 'general',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view/modify system settings
CREATE POLICY "Admins can view system_settings" 
ON public.system_settings 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert system_settings" 
ON public.system_settings 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update system_settings" 
ON public.system_settings 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete system_settings" 
ON public.system_settings 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
BEFORE UPDATE ON public.system_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default API key entries
INSERT INTO public.system_settings (key_name, key_value, description, category) VALUES
('PRINTNODE_API_KEY', '', 'PrintNode API Key for printing services', 'printing'),
('PRINTNODE_API_KEY_BACKUP', '', 'Backup PrintNode API Key', 'printing'),
('SHOPIFY_STORE_DOMAIN', '', 'Shopify store domain (e.g., mystore.myshopify.com)', 'shopify'),
('SHOPIFY_ADMIN_ACCESS_TOKEN', '', 'Shopify Admin API access token', 'shopify'),
('SHOPIFY_API_KEY', '', 'Shopify API Key', 'shopify'),
('SHOPIFY_API_SECRET', '', 'Shopify API Secret', 'shopify'),
('SHOPIFY_WEBHOOK_SECRET', '', 'Shopify Webhook Secret for validating webhooks', 'shopify'),
('FIRECRAWL_API_KEY', '', 'Firecrawl API Key for web scraping', 'external');