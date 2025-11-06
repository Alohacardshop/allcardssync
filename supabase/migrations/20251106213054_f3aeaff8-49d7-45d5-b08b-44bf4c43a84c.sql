-- Create table for storing ALT credentials (admin access only)
CREATE TABLE IF NOT EXISTS public.alt_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.alt_credentials ENABLE ROW LEVEL SECURITY;

-- Only admins can view credentials
CREATE POLICY "Admins can view alt_credentials"
ON public.alt_credentials
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can insert credentials
CREATE POLICY "Admins can insert alt_credentials"
ON public.alt_credentials
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can update credentials
CREATE POLICY "Admins can update alt_credentials"
ON public.alt_credentials
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Only admins can delete credentials
CREATE POLICY "Admins can delete alt_credentials"
ON public.alt_credentials
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Trigger to update updated_at timestamp
CREATE TRIGGER update_alt_credentials_updated_at
BEFORE UPDATE ON public.alt_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();