-- Add is_default column to label_templates
ALTER TABLE label_templates ADD COLUMN is_default BOOLEAN DEFAULT FALSE;

-- Create a unique constraint to ensure only one default per template_type
CREATE UNIQUE INDEX idx_unique_default_per_type ON label_templates (template_type) WHERE is_default = true;

-- Create a function to set a template as default (ensures only one default per type)
CREATE OR REPLACE FUNCTION set_template_default(template_id uuid, template_type_param text)
RETURNS void AS $$
BEGIN
  -- First, unset all defaults for this template type
  UPDATE label_templates 
  SET is_default = false 
  WHERE template_type = template_type_param;
  
  -- Then set the specified template as default
  UPDATE label_templates 
  SET is_default = true 
  WHERE id = template_id AND template_type = template_type_param;
END;
$$ LANGUAGE plpgsql;