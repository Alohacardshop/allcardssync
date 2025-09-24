-- Insert the priceBarcodeThirds2x1 template (fixed array type)
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
^PW420
^LL203  
^LH14,0
^FWN
^PON
^CI28
^PR4
^MD10
~SD15

// TOP third: condition (left), price (right, right-aligned, auto-fit)
^FO0,15^A0N,50,50^FD{{CONDITION}}^FS
^FO136,15^A0N,35,35^FB280,1,0,R,0^FD{{PRICE}}^FS

// MIDDLE third: barcode (double height of condition, centered, no HRI)  
^FO30,75
^BY3,2,80
^BCN,80,N,N,N^FD{{BARCODE}}^FS

// BOTTOM third: title (≤2 lines)
^FO0,165^A0N,18,18^FB392,2,4,L,0^FD{{TITLE}}^FS

^PQ1,1,0,Y
^XZ',
  ARRAY['CONDITION', 'PRICE', 'BARCODE', 'TITLE'],
  ARRAY[]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  body = EXCLUDED.body,
  required_fields = EXCLUDED.required_fields,
  optional_fields = EXCLUDED.optional_fields,
  updated_at = now();