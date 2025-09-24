-- Create the raw_card_2x1 template that the system is looking for
INSERT INTO label_templates (
  id, 
  name, 
  template_type, 
  is_default, 
  canvas
) VALUES (
  gen_random_uuid(),
  'raw_card_2x1',
  'raw',
  false,
  jsonb_build_object(
    'zplLabel', jsonb_build_object(
      'width', 406,
      'height', 203,
      'dpi', 203,
      'elements', jsonb_build_array(
        jsonb_build_object(
          'id', 'condition',
          'type', 'text',
          'position', jsonb_build_object('x', 0, 'y', 0),
          'boundingBox', jsonb_build_object('width', 114, 'height', 80),
          'text', 'NM',
          'font', 'D',
          'fontSize', 20,
          'fontWidth', 20,
          'rotation', 0,
          'autoSize', 'shrink-to-fit',
          'textOverflow', 'ellipsis'
        ),
        jsonb_build_object(
          'id', 'price',
          'type', 'text',
          'position', jsonb_build_object('x', 112, 'y', 3),
          'boundingBox', jsonb_build_object('width', 290, 'height', 76),
          'text', '$1000',
          'font', 'D',
          'fontSize', 20,
          'fontWidth', 20,
          'rotation', 0,
          'autoSize', 'shrink-to-fit',
          'textOverflow', 'ellipsis'
        ),
        jsonb_build_object(
          'id', 'barcode',
          'type', 'barcode',
          'position', jsonb_build_object('x', 8, 'y', 84),
          'size', jsonb_build_object('width', 393, 'height', 43),
          'barcodeType', 'CODE128',
          'data', '120979260',
          'height', 43,
          'humanReadable', false
        ),
        jsonb_build_object(
          'id', 'title',
          'type', 'text',
          'position', jsonb_build_object('x', 0, 'y', 134),
          'boundingBox', jsonb_build_object('width', 406, 'height', 68),
          'text', 'POKEMON GENGAR VMAX #020',
          'font', 'D',
          'fontSize', 16,
          'fontWidth', 16,
          'rotation', 0,
          'autoSize', 'shrink-to-fit',
          'textOverflow', 'wrap'
        )
      )
    ),
    'zplSettings', jsonb_build_object(
      'copies', 1,
      'darkness', 10,
      'speed', 4,
      'xOffset', 0,
      'yOffset', 0
    ),
    'fieldConfig', jsonb_build_object(),
    'labelData', jsonb_build_object(),
    'tsplSettings', jsonb_build_object()
  )
)
ON CONFLICT (id) DO NOTHING;