-- Remove conflicting check constraints on template_type
-- Keep the more permissive constraint that allows 'general', 'graded', 'raw'
ALTER TABLE label_templates DROP CONSTRAINT IF EXISTS template_type_check;

-- Ensure we have the correct constraint that allows all valid template types
DO $$ 
BEGIN
    -- Check if the constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'label_templates_template_type_check' 
        AND table_name = 'label_templates'
    ) THEN
        ALTER TABLE label_templates 
        ADD CONSTRAINT label_templates_template_type_check 
        CHECK (template_type IN ('general', 'graded', 'raw'));
    END IF;
END $$;

-- Update any existing templates that might have inconsistent data structure
-- Ensure all templates have proper canvas structure
UPDATE label_templates 
SET canvas = jsonb_build_object(
    'zplLabel', COALESCE(canvas->>'zplLabel', ''),
    'description', COALESCE(canvas->>'description', name),
    'fieldConfig', COALESCE(canvas->'fieldConfig', '{}'::jsonb),
    'labelData', COALESCE(canvas->'labelData', '{}'::jsonb),
    'tsplSettings', COALESCE(canvas->'tsplSettings', '{}'::jsonb)
)
WHERE canvas IS NOT NULL 
AND (canvas->>'zplLabel' IS NULL OR canvas->>'zplLabel' = '');

-- Create a default raw template if none exists
INSERT INTO label_templates (
    id,
    name,
    template_type,
    canvas,
    is_default,
    created_at,
    updated_at
)
SELECT 
    gen_random_uuid(),
    'Default Raw Card Template',
    'raw',
    jsonb_build_object(
        'zplLabel', '^XA^FO50,50^A0N,30,30^FDCard Name^FS^FO50,100^A0N,20,20^FDCondition: NM^FS^FO50,150^BY2^BCN,60,Y,N,N^FD123456^FS^XZ',
        'description', 'Default template for raw cards',
        'fieldConfig', jsonb_build_object(
            'includeTitle', true,
            'includeSku', true,
            'includePrice', true,
            'includeCondition', true,
            'barcodeMode', 'barcode'
        ),
        'labelData', jsonb_build_object(
            'title', 'Sample Card Name',
            'sku', '123456',
            'price', '10.00',
            'condition', 'NM'
        ),
        'tsplSettings', jsonb_build_object(
            'density', 10,
            'speed', 4,
            'gapInches', 0
        )
    ),
    true,
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM label_templates 
    WHERE template_type = 'raw' AND is_default = true
);