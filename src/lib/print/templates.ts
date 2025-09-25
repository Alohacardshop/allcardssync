// templates.ts
export const labelV2Template = `^XA
^MTD
^MNY
^PW420
^LL203
^FWN
^PON
^CI28

^FO20,28^A0N,48,48^FD{{CONDITION}}^FS
^FO160,24^A0N,52,44^FD{{PRICE}}^FS

^FO30,78
^BY3,2,72
^BCN,72,N,N,N^FD{{BARCODE}}^FS

^FO5,165^A0N,18,18^FB395,2,4,C,0^FD{{CARDNAME}}^FS

^PQ1
^XZ`;

export function renderLabelV2(data: {
  CONDITION: string; PRICE: string; BARCODE: string; CARDNAME: string;
}) {
  return labelV2Template
    .replace("{{CONDITION}}", data.CONDITION)
    .replace("{{PRICE}}", data.PRICE)
    .replace("{{BARCODE}}", data.BARCODE)
    .replace("{{CARDNAME}}", data.CARDNAME);
}