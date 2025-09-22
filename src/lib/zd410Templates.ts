export interface LabelData {
  cardName?: string;
  setName?: string;
  condition?: string;
  price?: number;
  sku?: string;
  barcode?: string;
}

/**
 * ZD410-specific ZPL template for raw card labels
 * Uses the exact format that works with the ZD410 cutter
 */
export function generateRawCardLabel(data: LabelData): string {
  const {
    cardName = 'Unknown Card',
    setName = '',
    condition = 'NM',
    price = 0,
    sku = '',
    barcode = ''
  } = data;

  // Format price display
  const priceDisplay = price ? `$${price.toFixed(2)}` : '$0.00';
  
  // Create barcode data - use SKU if available, otherwise use cardName
  const barcodeData = sku || cardName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 12);

  // Use exact ZPL format that works with ZD410 - simplified and clean
  return `^XA
^MMC
^MT6
^CI28
^LH0,0
^PR4
^MD15

^FO50,30^A0N,28,28^FD${cardName}^FS
^FO50,70^A0N,20,20^FD${setName}^FS
^FO50,100^A0N,24,24^FD${condition}^FS
^FO200,100^A0N,32,32^FD${priceDisplay}^FS

^FO50,140^BCN,60,Y,N,N^FD${barcodeData}^FS
^FO50,210^A0N,16,16^FD${sku}^FS

^PQ1,1,0
^XZ`;
}

/**
 * Test label for ZD410 - matches exactly what works
 */
export function generateTestLabel(): string {
  return `^XA
^MMC
^MT6
^CI28
^LH0,0
^PR4
^MD15

^FO50,30^A0N,28,28^FDTest Print^FS
^FO50,70^A0N,20,20^FDZD410 Ready^FS
^FO50,100^A0N,24,24^FDNM^FS
^FO200,100^A0N,32,32^FD$5.00^FS

^FO50,140^BCN,60,Y,N,N^FDTEST123^FS
^FO50,210^A0N,16,16^FDSKU-TEST^FS

^PQ1,1,0
^XZ`;
}