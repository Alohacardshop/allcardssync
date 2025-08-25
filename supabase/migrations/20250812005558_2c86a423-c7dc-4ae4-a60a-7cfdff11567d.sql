-- Create shared table for label templates
CREATE TABLE IF NOT EXISTS public.label_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  canvas JSONB NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.label_templates ENABLE ROW LEVEL SECURITY;

-- Shared access policies (project is public/shared per user request)
CREATE POLICY IF NOT EXISTS "Anyone can view label_templates"
ON public.label_templates
FOR SELECT
USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can insert label_templates"
ON public.label_templates
FOR INSERT
WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Anyone can update label_templates"
ON public.label_templates
FOR UPDATE
USING (true);

CREATE POLICY IF NOT EXISTS "Anyone can delete label_templates"
ON public.label_templates
FOR DELETE
USING (true);

-- Keep updated_at fresh
CREATE TRIGGER update_label_templates_updated_at
BEFORE UPDATE ON public.label_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();