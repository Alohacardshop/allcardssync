-- Delete any existing general templates
DELETE FROM label_templates WHERE template_type = 'general';

-- Add a check constraint to ensure only graded and raw templates are allowed
-- First, drop any existing constraint if it exists
ALTER TABLE label_templates DROP CONSTRAINT IF EXISTS template_type_check;

-- Add new constraint allowing only graded and raw
ALTER TABLE label_templates ADD CONSTRAINT template_type_check 
CHECK (template_type IN ('graded', 'raw'));