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

  return [
    '^XA',
    '^MNY',           // gap media (use ^MNN for continuous)
    '^MTD',           // direct thermal (ZD410)
    '^MMC',           // enable cutter mode
    '^PW448',         // 2" width @203dpi = 448 dots
    '^LL400',         // label length in dots (~2.0")
    '^LH0,0',
    '^CI28',          // UTF-8 safe
    '',
    `^FO40,30^A0N,28,28^FD${cardName}^FS`,
    `^FO40,70^A0N,20,20^FD${setName}^FS`,
    `^FO40,100^A0N,24,24^FD${condition}^FS`,
    `^FO200,100^A0N,32,32^FD${priceDisplay}^FS`,
    '',
    `^FO40,140^BCN,60,Y,N,N^FD${barcodeData}^FS`,
    `^FO40,210^A0N,16,16^FD${sku}^FS`,
    '',
    '^PQ1,1,0,Y',     // 1 label, cut after each
    '^XZ'
  ].join('\n');
}

/**
 * Test label for ZD410 - using correct ZPL format
 */
export function generateTestLabel(): string {
  const timestamp = new Date().toLocaleString();
  
  return [
    '^XA',
    '^MNY',           // gap media (use ^MNN for continuous)
    '^MTD',           // direct thermal (ZD410)
    '^MMC',           // enable cutter mode
    '^PW448',         // 2" width @203dpi = 448 dots
    '^LL400',         // label length in dots (~2.0")
    '^LH0,0',
    '^CI28',          // UTF-8 safe
    '',
    '^FO40,40^A0N,28,28^FDTEST PRINT ZD410^FS',
    `^FO40,90^A0N,22,22^FD${timestamp}^FS`,
    '^FO40,130^A0N,18,18^FDZD410 Cut Test^FS',
    '',
    '^PQ1,1,0,Y',     // 1 label, cut after each
    '^XZ'
  ].join('\n');
}

/**
 * ZD410 test template function - standardized for all test prints
 */
export const zd410TestLabelZPL = (timestamp?: string) => {
  const ts = timestamp || new Date().toLocaleString();
  
  return [
    '^XA',
    '^MNY',           // gap media (use ^MNN for continuous)
    '^MTD',           // direct thermal (ZD410)
    '^MMC',           // cutter mode
    '^PW448',         // 2" width @203dpi
    '^LL400',         // label length (dots)
    '^LH0,0',
    '^CI28',
    '^FO40,40^A0N,28,28^FDTEST PRINT ZD410^FS',
    `^FO40,90^A0N,22,22^FD${ts}^FS`,
    '^FO40,130^A0N,18,18^FDZD410 Cut Test^FS',
    '^PQ1,1,0,Y',
    '^XZ'
  ].join('\n');
};