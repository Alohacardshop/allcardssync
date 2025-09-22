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
  cutTiming?: 'after-each' | 'after-interval' | 'end-of-job'; // When to cut
  cutInterval?: number; // Cut after every N labels (only used with 'after-interval')
  hasCutter?: boolean; // Whether printer has a cutter
}

/**
 * Generate cutting commands for ZPL based on options
 * Updated for ZD410 compatibility
 */
function generateCutCommands(options: ZPLOptions): string {
  const {
    cutAfter = false,
    cutTiming = 'after-each',
    cutInterval = 1,
    hasCutter = false,
    copies = 1
  } = options;

  if (!cutAfter || !hasCutter) {
    return '';
  }

  // ZD410-specific cutting sequence
  switch (cutTiming) {
    case 'after-each':
      // ZD410 requires: ^MMC (cutter mode) + ^MT6 (continuous media) + ^PQ with pause parameter
      return `^MMC
^MT6`;
    case 'after-interval':
      // Cut after specified number of labels
      return `^MMC
^MT6`;
    case 'end-of-job':
      // Cut only at the end of the entire job
      return `^MMC
^MT6`;
    default:
      return `^MMC
^MT6`;
  }
}

/**
 * Generate simple price tag ZPL
 */
export function generatePriceTagZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1
  } = options;

  const { title = '', price = '', sku = '', condition = '' } = data;

  // Calculate positions based on DPI (2x1 inch label)
  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;

  const cutCommands = generateCutCommands(options);

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}
${cutCommands}

~SD15
^FO10,10^A0N,28,28^FD${title.substring(0, 25)}^FS
^FO${labelWidth - 120},15^A0N,35,35^FD$${price}^FS
${condition ? `^FO${labelWidth - 120},55^A0N,18,18^FD${condition}^FS` : ''}
${sku ? `^FO10,${labelHeight - 30}^A0N,16,16^FDSKU: ${sku}^FS` : ''}

^PQ${copies}
^XZ`;
}

/**
 * Generate simple barcode label ZPL
 */
export function generateBarcodeLabelZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1
  } = options;

  const { title = '', barcode = '', description = '', sku = '' } = data;

  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;

  const cutCommands = generateCutCommands(options);

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}
${cutCommands}

~SD15
${title ? `^FO10,10^A0N,24,24^FD${title.substring(0, 30)}^FS` : ''}
^FO50,${title ? 35 : 20}^BCN,60,Y,N,N^FD${barcode}^FS
${description ? `^FO10,${labelHeight - 25}^A0N,16,16^FD${description.substring(0, 35)}^FS` : ''}
${sku ? `^FO${labelWidth - 100},${labelHeight - 25}^A0N,16,16^FD${sku}^FS` : ''}

^PQ${copies}
^XZ`;
}

/**
 * Generate QR code shelf label ZPL
 */
export function generateQRShelfLabelZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1
  } = options;

  const { title = '', qrCode = '', location = '', description = '' } = data;

  // 2.25x1.25 inch label
  const labelWidth = Math.floor(dpi * 2.25);
  const labelHeight = Math.floor(dpi * 1.25);

  const cutCommands = generateCutCommands(options);

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}
${cutCommands}

~SD15
^FO15,20^BQN,2,6^FDQM,${qrCode}^FS
^FO120,15^A0N,32,32^FD${title.substring(0, 20)}^FS
${location ? `^FO120,50^A0N,24,24^FDLOC: ${location}^FS` : ''}
${description ? `^FO120,75^A0N,20,20^FD${description.substring(0, 15)}^FS` : ''}

^PQ${copies}
^XZ`;
}

/**
 * Generate simple test label ZPL
 */
export function generateTestLabelZPL(options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1
  } = options;

  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;
  const timestamp = new Date().toLocaleString();

  const cutCommands = generateCutCommands(options);

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}
${cutCommands}

~SD15
^FO10,10^A0N,32,32^FDTEST PRINT^FS
^FO10,50^A0N,24,24^FD${timestamp}^FS
^FO10,80^BCN,40,Y,N,N^FD123456789^FS

^PQ${copies}
^XZ`;
}

/**
 * Generate raw card label ZPL with comprehensive card data
 * Updated for ZD410 cutting compatibility
 */
export function generateRawCardLabelZPL(data: LabelData, options: ZPLOptions = {}): string {
  const {
    dpi = 203,
    speed = 4,
    darkness = 10,
    copies = 1,
    cutAfter = false,
    hasCutter = false
  } = options;

  const { title = '', sku = '', price = '', condition = '', location = '' } = data;

  // 2x1 inch label for raw cards (optimized for trading cards)
  const labelWidth = dpi * 2;
  const labelHeight = dpi * 1;

  const cutCommands = generateCutCommands(options);
  
  // ZD410 requires ^PQ with pause parameter for cutting
  const pqCommand = cutAfter && hasCutter ? `^PQ${copies},1,0` : `^PQ${copies}`;

  return `^XA
^MMT
^PW${labelWidth}
^LL${labelHeight}
^LH0,0
^PR${speed}
^MD${darkness}
${cutCommands}

~SD15
^FO10,10^A0N,20,20^FD${title.substring(0, 35)}^FS
^FO${labelWidth - 100},15^A0N,28,28^FD$${price}^FS
${condition ? `^FO${labelWidth - 100},45^A0N,16,16^FD${condition}^FS` : ''}
^FO20,${labelHeight - 60}^BCN,40,Y,N,N^FD${sku}^FS
${location ? `^FO10,${labelHeight - 15}^A0N,12,12^FDLOC: ${location}^FS` : ''}

${pqCommand}
^XZ`;
}

/**
 * Template registry for easy access
 */
export const ZPL_TEMPLATES = {
  priceTag: generatePriceTagZPL,
  barcode: generateBarcodeLabelZPL,
  qrShelf: generateQRShelfLabelZPL,
  rawCard: generateRawCardLabelZPL,
  test: generateTestLabelZPL
} as const;

export type TemplateType = keyof typeof ZPL_TEMPLATES;