-- Fix the function search path security issue
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';