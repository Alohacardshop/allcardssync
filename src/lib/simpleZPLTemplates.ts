/**
 * Simple ZPL Template Generator
 * Direct string-based ZPL generation for common label types
 */

export interface LabelData {
  title?: string;
  price?: string;
  sku?: string;
  barcode?: string;
  condition?: string;
  qrCode?: string;
  location?: string;
  description?: string;
}

export interface ZPLOptions {
  dpi?: 203 | 300;
  speed?: number; // 2-6 IPS
  darkness?: number; // 0-30
  copies?: number;
  cutAfter?: boolean;
}

/**
 * Generate simple price tag ZPL
 */
export function generatePriceTagZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1,
    cutAfter = true
  } = options;

  const { title = '', price = '', sku = '', condition = '' } = data;

  // Calculate positions based on DPI (2x1 inch label)
  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}

~SD15
^FO10,10^A0N,28,28^FD${title.substring(0, 25)}^FS
^FO${labelWidth - 120},15^A0N,35,35^FD$${price}^FS
${condition ? `^FO${labelWidth - 120},55^A0N,18,18^FD${condition}^FS` : ''}
${sku ? `^FO10,${labelHeight - 30}^A0N,16,16^FDSKU: ${sku}^FS` : ''}

^PQ${copies}
${cutAfter ? '^MMC^XZ' : '^XZ'}`;
}

/**
 * Generate simple barcode label ZPL
 */
export function generateBarcodeLabelZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1,
    cutAfter = true
  } = options;

  const { title = '', barcode = '', description = '', sku = '' } = data;

  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}

~SD15
${title ? `^FO10,10^A0N,24,24^FD${title.substring(0, 30)}^FS` : ''}
^FO50,${title ? 35 : 20}^BCN,60,Y,N,N^FD${barcode}^FS
${description ? `^FO10,${labelHeight - 25}^A0N,16,16^FD${description.substring(0, 35)}^FS` : ''}
${sku ? `^FO${labelWidth - 100},${labelHeight - 25}^A0N,16,16^FD${sku}^FS` : ''}

^PQ${copies}
${cutAfter ? '^MMC^XZ' : '^XZ'}`;
}

/**
 * Generate QR code shelf label ZPL
 */
export function generateQRShelfLabelZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1,
    cutAfter = true
  } = options;

  const { title = '', qrCode = '', location = '', description = '' } = data;

  // 2.25x1.25 inch label
  const labelWidth = Math.floor(dpi * 2.25);
  const labelHeight = Math.floor(dpi * 1.25);

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}

~SD15
^FO15,20^BQN,2,6^FDQM,${qrCode}^FS
^FO120,15^A0N,32,32^FD${title.substring(0, 20)}^FS
${location ? `^FO120,50^A0N,24,24^FDLOC: ${location}^FS` : ''}
${description ? `^FO120,75^A0N,20,20^FD${description.substring(0, 15)}^FS` : ''}

^PQ${copies}
${cutAfter ? '^MMC^XZ' : '^XZ'}`;
}

/**
 * Generate simple test label ZPL
 */
export function generateTestLabelZPL(options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1,
    cutAfter = true
  } = options;

  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;
  const timestamp = new Date().toLocaleString();

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}

~SD15
^FO10,10^A0N,32,32^FDTEST PRINT^FS
^FO10,50^A0N,24,24^FD${timestamp}^FS
^FO10,80^BCN,40,Y,N,N^FD123456789^FS

^PQ${copies}
${cutAfter ? '^MMC^XZ' : '^XZ'}`;
}

/**
 * Template registry for easy access
 */
export const ZPL_TEMPLATES = {
  priceTag: generatePriceTagZPL,
  barcode: generateBarcodeLabelZPL,
  qrShelf: generateQRShelfLabelZPL,
  test: generateTestLabelZPL
} as const;

export type TemplateType = keyof typeof ZPL_TEMPLATES;