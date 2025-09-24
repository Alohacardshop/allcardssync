-- Insert the 2x1 thirds barcode label template
INSERT INTO public.label_templates_new (
  id, 
  body, 
  required_fields, 
  optional_fields
) VALUES (
  'priceBarcodeThirds2x1',
  '^XA
^MTD
^MNY
^PW{{PW}}
^LL{{LL}}  
^LH{{LH_X}},0
^FWN
^PON
^CI28
^PR{{SPEED}}
^MD{{DARKNESS}}
~SD15

// TOP third: condition (left), price (right, right-aligned, auto-fit)
^FO0,{{COND_Y}}^A0N,{{COND_SIZE}},{{COND_SIZE}}^FD{{CONDITION}}^FS
^FO{{LEFT_W}},{{PRICE_Y}}^A0N,{{PRICE_SIZE}},{{PRICE_SIZE}}^FB{{PRICE_BOX_W}},1,0,R,0^FD{{PRICE}}^FS

// MIDDLE third: barcode (double height of condition, centered, no HRI)  
^FO{{BC_X}},{{BC_Y}}
^BY{{MODULE_W}},2,{{BC_H}}
^BCN,{{BC_H}},N,N,N^FD{{BARCODE}}^FS

// BOTTOM third: title (≤2 lines)
^FO{{TITLE_X}},{{TITLE_Y}}^A0N,{{TITLE_SIZE}},{{TITLE_SIZE}}^FB{{TITLE_FB_W}},2,{{TITLE_LINE_SPACING}},L,0^FD{{TITLE}}^FS

^PQ{{COPIES}},1,0,Y
^XZ',
  ARRAY['CONDITION', 'PRICE', 'BARCODE', 'TITLE'],
  ARRAY['PW', 'LL', 'LH_X', 'SPEED', 'DARKNESS', 'COND_Y', 'COND_SIZE', 'LEFT_W', 'PRICE_Y', 'PRICE_SIZE', 'PRICE_BOX_W', 'BC_X', 'BC_Y', 'MODULE_W', 'BC_H', 'TITLE_X', 'TITLE_Y', 'TITLE_SIZE', 'TITLE_FB_W', 'TITLE_LINE_SPACING', 'COPIES']
)
ON CONFLICT (id) DO UPDATE SET
  body = EXCLUDED.body,
  required_fields = EXCLUDED.required_fields,
  optional_fields = EXCLUDED.optional_fields,
  updated_at = now();