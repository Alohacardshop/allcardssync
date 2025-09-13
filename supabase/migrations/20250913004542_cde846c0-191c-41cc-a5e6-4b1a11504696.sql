-- Create RPC function to set a template as default
CREATE OR REPLACE FUNCTION public.set_template_default(template_id uuid, template_type_param text DEFAULT 'general')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  -- Only staff/admin can set default templates
  IF NOT (has_role(auth.uid(), 'staff'::app_role) OR has_role(auth.uid(), 'admin'::app_role)) THEN
    RAISE EXCEPTION 'Access denied: Staff/Admin role required to set default templates';
  END IF;

  -- Unset any existing default templates for this type
  UPDATE public.label_templates 
  SET is_default = false, updated_at = now()
  WHERE template_type = template_type_param AND is_default = true;

  -- Set the new default template
  UPDATE public.label_templates 
  SET is_default = true, updated_at = now()
  WHERE id = template_id AND template_type = template_type_param;

  -- Verify the template exists and was updated
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or access denied';
  END IF;
END;
$$;