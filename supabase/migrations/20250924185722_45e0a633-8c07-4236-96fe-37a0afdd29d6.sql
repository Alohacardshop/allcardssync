-- Update the barcode template with the new ZPL code and template variables
UPDATE label_templates_new 
SET body = '^XA
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

^FO20,28^A0N,50,50^FD{{CONDITION}}^FS
^FO136,25^A0N,55,45^FB280,1,0,L,0^FD{{PRICE}}^FS

^FO30,75
^BY3,2,72
^BCN,72,N,N,N^FD{{BARCODE}}^FS

^FO5,165^A0N,18,18^FB395,2,4,C,0^FD{{CARDNAME}}^FS

^PQ1,1,0,Y
^XZ'
WHERE id = 'barcode';