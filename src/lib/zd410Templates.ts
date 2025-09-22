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
 * Optimized for 2"x1" labels with proper positioning and no rotation
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
    '^PW448',         // 2.2" width for ZD410 (448 dots at 203dpi)
    '^LL203',         // 1" label height at 203dpi
    '^LH0,0',
    '^CI28',          // UTF-8 safe
    '',
    // No rotation (N), proper positioning for 2x1 label
    `^FO20,15^AN,18,18^FD${condition}^FS`,
    `^FO300,15^AN,20,20^FD${priceDisplay}^FS`,
    `^FO20,50^BCN,35,N,N,N^FD${barcodeData}^FS`,
    `^FO20,95^AN,14,14^FD${cardName}^FS`,
    `^FO20,120^AN,10,10^FD${sku}^FS`,
    '',
    '^PQ1,1,0,Y',     // 1 label, cut after each
    '^XZ'
  ].join('\n');
}

/**
 * Test label for ZD410 - optimized for 2"x1" labels with no rotation
 */
export function generateTestLabel(): string {
  const timestamp = new Date().toLocaleString();
  
  return [
    '^XA',
    '^MNY',           // gap media (use ^MNN for continuous)
    '^MTD',           // direct thermal (ZD410)
    '^MMC',           // enable cutter mode
    '^PW448',         // 2.2" width for ZD410
    '^LL203',         // 1" label height at 203dpi
    '^LH0,0',
    '^CI28',          // UTF-8 safe
    '',
    '^FO20,15^AN,18,18^FDTEST PRINT ZD410^FS',
    `^FO20,50^AN,14,14^FD${timestamp}^FS`,
    '^FO20,80^AN,12,12^FDZD410 2x1 Test^FS',
    '',
    '^PQ1,1,0,Y',     // 1 label, cut after each
    '^XZ'
  ].join('\n');
}

/**
 * ZD410 test template function - standardized for 2"x1" labels with no rotation
 */
export const zd410TestLabelZPL = (timestamp?: string) => {
  const ts = timestamp || new Date().toLocaleString();
  
  return [
    '^XA',
    '^MNY',           // gap media (use ^MNN for continuous)
    '^MTD',           // direct thermal (ZD410)
    '^MMC',           // cutter mode
    '^PW448',         // 2.2" width for ZD410 
    '^LL203',         // 1" label height at 203dpi
    '^LH0,0',
    '^CI28',
    '^FO20,15^AN,18,18^FDTEST PRINT ZD410^FS',
    `^FO20,50^AN,14,14^FD${ts}^FS`,
    '^FO20,80^AN,12,12^FDZD410 2x1 Test^FS',
    '^PQ1,1,0,Y',
    '^XZ'
  ].join('\n');
};