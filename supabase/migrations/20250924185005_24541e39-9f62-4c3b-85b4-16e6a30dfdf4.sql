-- Update the barcode template to use template variables instead of hardcoded values
UPDATE label_templates_new 
SET body = '^XA
^MMT
^PW406
^LL0203
^LS0
^FT20,40^A0N,28,28^FH\^FD{{CARDNAME}}^FS
^FT20,80^A0N,20,19^FH\^FDCondition: {{CONDITION}}^FS
^FT20,120^A0N,20,19^FH\^FDPrice: {{PRICE}}^FS
^FT20,160^BY3,3,57^BCN,,Y,N
^FD{{BARCODE}}^FS
^XZ'
WHERE id = 'barcode';