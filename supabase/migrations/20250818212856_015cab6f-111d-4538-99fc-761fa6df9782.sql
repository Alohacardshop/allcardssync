-- Add template_type column to label_templates table
ALTER TABLE public.label_templates 
ADD COLUMN template_type text DEFAULT 'general' CHECK (template_type IN ('general', 'graded', 'raw'));

-- Create index for faster lookups
CREATE INDEX idx_label_templates_type ON public.label_templates(template_type);

-- Update existing templates to be 'general' type
UPDATE public.label_templates SET template_type = 'general' WHERE template_type IS NULL;