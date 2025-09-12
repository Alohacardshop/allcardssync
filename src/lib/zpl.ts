// ZPL (Zebra Programming Language) generator - Single source of truth

// Element types for ZPL generation
export interface TextElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
  font?: string; // A, B, C, D, E, F, G, H, 0
  size?: number;
  rotation?: 0 | 90 | 180 | 270;
}

export interface BarcodeElement {
  type: 'barcode';
  x: number;
  y: number;
  data: string;
  height?: number;
  width?: number;
  showText?: boolean;
  barcodeType?: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8';
}

export interface QRElement {
  type: 'qr';
  x: number;
  y: number;
  data: string;
  size?: number;
  errorLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface BoxElement {
  type: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
  thickness?: number;
}

export interface LineElement {
  type: 'line';
  x: number;
  y: number;
  width: number;
  height: number;
  thickness?: number;
}

export type ZPLElement = TextElement | BarcodeElement | QRElement | BoxElement | LineElement;

// ZPL Options interface
export interface ZPLOptions {
  widthMm?: number;
  heightMm?: number;
  widthDots?: number;
  heightDots?: number;
  dpi?: 203 | 300;
  speedIps?: number; // Print speed in inches per second (1-14)
  darkness?: number; // 0-30
  copies?: number;
  elements?: ZPLElement[];
}

// Helper function: Convert mm to dots
export function mmToDots(mm: number, dpi: number = 203): number {
  return Math.round((mm / 25.4) * dpi);
}

// Helper function: Convert points to dots (keeping for compatibility)
export function ptToDots(mm: number, dpi: number = 203): number {
  return mmToDots(mm, dpi);
}

// Helper function: Create text element
export function text(
  x: number, 
  y: number, 
  text: string, 
  font: string = 'A', 
  size: number = 30, 
  rotation: 0 | 90 | 180 | 270 = 0
): TextElement {
  return {
    type: 'text',
    x,
    y,
    text,
    font,
    size,
    rotation
  };
}

// Helper function: Create CODE128 barcode element
export function barcode128(
  x: number,
  y: number,
  data: string,
  height: number = 80,
  width: number = 2,
  showText: boolean = true
): BarcodeElement {
  return {
    type: 'barcode',
    x,
    y,
    data,
    height,
    width,
    showText,
    barcodeType: 'CODE128'
  };
}

// Helper function: Create QR code element
export function qr(
  x: number,
  y: number,
  data: string,
  size: number = 5,
  errorLevel: 'L' | 'M' | 'Q' | 'H' = 'M'
): QRElement {
  return {
    type: 'qr',
    x,
    y,
    data,
    size,
    errorLevel
  };
}

// Helper function: Create box element
export function box(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number = 1
): BoxElement {
  return {
    type: 'box',
    x,
    y,
    width,
    height,
    thickness
  };
}

// Helper function: Create line element
export function line(
  x: number,
  y: number,
  width: number,
  height: number,
  thickness: number = 1
): LineElement {
  return {
    type: 'line',
    x,
    y,
    width,
    height,
    thickness
  };
}

// Main ZPL generation function
export function buildZPL(options: ZPLOptions = {}): string {
  const {
    widthMm,
    heightMm,
    widthDots,
    heightDots,
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    elements = []
  } = options;

  // Calculate label dimensions in dots
  const labelWidthDots = widthDots ?? (widthMm ? mmToDots(widthMm, dpi) : mmToDots(50.8, dpi)); // Default 2 inches
  const labelHeightDots = heightDots ?? (heightMm ? mmToDots(heightMm, dpi) : mmToDots(25.4, dpi)); // Default 1 inch

  const commands: string[] = [];

  // Header commands (always emit these)
  commands.push('^XA'); // Start format
  commands.push(`^MD${darkness}`); // Media darkness
  commands.push(`^PR${speedIps}`); // Print rate (speed)
  commands.push(`^LL${labelHeightDots}`); // Label length

  // Process elements
  elements.forEach(element => {
    switch (element.type) {
      case 'text':
        commands.push(`^FO${element.x},${element.y}`); // Field origin
        const rotChar = element.rotation === 90 ? 'R' : element.rotation === 180 ? 'I' : element.rotation === 270 ? 'B' : 'N';
        commands.push(`^A${element.font || 'A'}${rotChar},${element.size || 30},${element.size || 30}`); // Font
        commands.push(`^FD${element.text}^FS`); // Field data
        break;

      case 'barcode':
        commands.push(`^FO${element.x},${element.y}`); // Field origin
        let barcodeCmd = '^BC'; // Default to CODE128
        switch (element.barcodeType) {
          case 'CODE39': barcodeCmd = '^B3'; break;
          case 'EAN13': barcodeCmd = '^BE'; break;
          case 'EAN8': barcodeCmd = '^B8'; break;
        }
        const showTextFlag = element.showText !== false ? 'Y' : 'N';
        commands.push(`${barcodeCmd}N,${element.height || 80},${showTextFlag},N,N`);
        commands.push(`^FD${element.data}^FS`);
        break;

      case 'qr':
        commands.push(`^FO${element.x},${element.y}`); // Field origin
        commands.push(`^BQN,2,${element.size || 5}`); // QR code
        commands.push(`^FDMM,A${element.errorLevel || 'M'},${element.data}^FS`);
        break;

      case 'box':
        commands.push(`^FO${element.x},${element.y}`); // Field origin
        commands.push(`^GB${element.width},${element.height},${element.thickness || 1}^FS`);
        break;

      case 'line':
        commands.push(`^FO${element.x},${element.y}`); // Field origin
        commands.push(`^GB${element.width},${element.height},${element.thickness || 1}^FS`);
        break;
    }
  });

  // Footer commands (always emit these)
  commands.push(`^PQ${copies}`); // Print quantity
  commands.push('^XZ'); // End format

  return commands.join('\n');
}

// ZPL generation with optional cut at end
export function buildZPLWithCut(options: ZPLOptions = {}, cutAtEnd: boolean = false): string {
  const zpl = buildZPL(options);
  
  if (cutAtEnd) {
    // Insert ^MMB before ^XZ
    const lines = zpl.split('\n');
    const xzIndex = lines.findIndex(line => line === '^XZ');
    if (xzIndex !== -1) {
      lines.splice(xzIndex, 0, '^MMB'); // Insert cut command before ^XZ
    }
    return lines.join('\n');
  }
  
  return zpl;
}

// Legacy compatibility exports (keep existing functionality working)
export const LABEL_WIDTH_IN = 2;
export const LABEL_HEIGHT_IN = 1;
export const DPI = 203;

export const dots = (inches: number): number => Math.round(inches * DPI);

// Legacy ZPL Options interface for backward compatibility
export interface LegacyZPLOptions {
  textLines?: Array<{
    text: string;
    x?: number;
    y?: number;
    fontSize?: number;
    rotation?: 0 | 90 | 180 | 270;
    font?: string;
  }>;
  qrcode?: {
    data: string;
    x?: number;
    y?: number;
    size?: number;
    errorLevel?: 'L' | 'M' | 'Q' | 'H';
  };
  barcode?: {
    data: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    type?: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8';
  };
  lines?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  printDensity?: number;
  printSpeed?: number;
  labelLength?: number;
}

// Keep existing layout interfaces for compatibility
export interface LabelFieldConfig {
  includeTitle: boolean;
  includeSku: boolean;
  includePrice: boolean;
  includeLot: boolean;
  includeCondition: boolean;
  barcodeMode: 'qr' | 'barcode' | 'none';
}

export interface LabelFieldLayout {
  visible: boolean;
  x: number;
  y: number;
  fontSize: number;
  prefix?: string;
}

export interface LabelBarcodeLayout {
  mode: 'qr' | 'barcode' | 'none';
  x: number;
  y: number;
  width?: number;
  height?: number;
  size?: number;
}

export interface LabelLayout {
  title: LabelFieldLayout;
  sku: LabelFieldLayout;
  price: LabelFieldLayout;
  lot: LabelFieldLayout;
  condition: LabelFieldLayout;
  barcode: LabelBarcodeLayout;
  printer?: {
    printDensity?: number;
    printSpeed?: number;
    labelLength?: number;
  };
}

// Legacy buildZPL function for existing code compatibility 
function buildLegacyZPL(options: LegacyZPLOptions = {}): string {
  const {
    textLines = [],
    qrcode,
    barcode,
    lines = [],
    printDensity = 8,
    printSpeed = 6,
    labelLength = dots(LABEL_HEIGHT_IN)
  } = options;

  const elements: ZPLElement[] = [];

  // Convert legacy textLines to new format
  textLines.forEach(({ text, x = 10, y = 20, fontSize = 30, rotation = 0, font = 'A' }) => {
    elements.push({
      type: 'text',
      x,
      y,
      text,
      font,
      size: fontSize,
      rotation
    });
  });

  // Convert legacy qrcode to new format
  if (qrcode) {
    elements.push({
      type: 'qr',
      x: qrcode.x || 10,
      y: qrcode.y || 80,
      data: qrcode.data,
      size: qrcode.size || 5,
      errorLevel: qrcode.errorLevel || 'M'
    });
  }

  // Convert legacy barcode to new format
  if (barcode) {
    elements.push({
      type: 'barcode',
      x: barcode.x || 10,
      y: barcode.y || 80,
      data: barcode.data,
      height: barcode.height || 50,
      width: barcode.width || 2,
      barcodeType: barcode.type || 'CODE128',
      showText: true
    });
  }

  // Convert legacy lines to new format
  lines.forEach(({ x, y, width, height }) => {
    elements.push({
      type: 'line',
      x,
      y,
      width,
      height,
      thickness: height < width ? height : width
    });
  });

  return buildZPL({
    heightDots: labelLength,
    darkness: printDensity,
    speedIps: printSpeed,
    elements
  });
}

export function buildSampleLabel(): string {
  return buildZPL({
    elements: [
      text(20, 20, 'ALOHA CARD SHOP', 'A', 30),
      barcode128(50, 80, '123456789012', 80, 2, true)
    ]
  });
}

export function generateZPLFromLayout(
  layout: LabelLayout,
  data: {
    title?: string;
    sku?: string;
    price?: string;
    lot?: string;
    barcode?: string;
    condition?: string;
  },
  zplSettings?: { printDensity?: number; printSpeed?: number; labelLength?: number }
): string {
  const textLines: LegacyZPLOptions['textLines'] = [];

  // Add text fields based on layout
  if (layout.title.visible && data.title) {
    textLines.push({
      text: data.title.slice(0, 25),
      x: layout.title.x,
      y: layout.title.y,
      fontSize: layout.title.fontSize
    });
  }

  if (layout.sku.visible && data.sku) {
    const prefix = layout.sku.prefix || 'SKU: ';
    textLines.push({
      text: `${prefix}${data.sku}`,
      x: layout.sku.x,
      y: layout.sku.y,
      fontSize: layout.sku.fontSize
    });
  }

  if (layout.price.visible && data.price) {
    const priceText = data.price.startsWith('$') ? data.price : `$${data.price}`;
    textLines.push({
      text: priceText,
      x: layout.price.x,
      y: layout.price.y,
      fontSize: layout.price.fontSize
    });
  }

  if (layout.lot.visible && data.lot) {
    const prefix = layout.lot.prefix || 'LOT: ';
    textLines.push({
      text: `${prefix}${data.lot}`,
      x: layout.lot.x,
      y: layout.lot.y,
      fontSize: layout.lot.fontSize
    });
  }

  if (layout.condition.visible && data.condition) {
    textLines.push({
      text: data.condition,
      x: layout.condition.x,
      y: layout.condition.y,
      fontSize: layout.condition.fontSize
    });
  }

  const effectiveSettings = {
    ...layout.printer,
    ...zplSettings
  };

  const options: LegacyZPLOptions = {
    textLines,
    ...effectiveSettings
  };

  if (layout.barcode.mode !== 'none' && data.barcode) {
    if (layout.barcode.mode === 'qr') {
      options.qrcode = {
        data: data.barcode,
        x: layout.barcode.x,
        y: layout.barcode.y,
        size: layout.barcode.size || 4
      };
    } else if (layout.barcode.mode === 'barcode') {
      options.barcode = {
        data: data.barcode,
        x: layout.barcode.x,
        y: layout.barcode.y,
        width: layout.barcode.width || 2,
        height: layout.barcode.height || 50,
        type: 'CODE128'
      };
    }
  }

  return buildLegacyZPL(options);
}

function calculateOptimalFontSize(
  text: string,
  maxWidth: number,
  maxFontSize: number = 50,
  minFontSize: number = 15
): number {
  const charWidthRatio = 0.6;
  
  for (let fontSize = maxFontSize; fontSize >= minFontSize; fontSize -= 5) {
    const estimatedWidth = text.length * fontSize * charWidthRatio;
    if (estimatedWidth <= maxWidth) {
      return fontSize;
    }
  }
  
  return minFontSize;
}

export function generateBoxedLayoutZPL(
  data: {
    title?: string;
    sku?: string;
    price?: string;
    lot?: string;
    barcode?: string;
    condition?: string;
  },
  fieldConfig: LabelFieldConfig,
  zplSettings?: { printDensity?: number; printSpeed?: number; labelLength?: number }
): string {
  const textLines: LegacyZPLOptions['textLines'] = [];
  
  const labelWidth = dots(LABEL_WIDTH_IN);
  const labelHeight = dots(LABEL_HEIGHT_IN);
  
  const topBoxHeight = 50;
  const titleBoxHeight = 60;
  const barcodeBoxHeight = labelHeight - topBoxHeight - titleBoxHeight;
  const topBoxWidth = Math.floor(labelWidth / 2) - 5;
  
  if (fieldConfig.includeCondition && data.condition) {
    const conditionFontSize = calculateOptimalFontSize(data.condition, topBoxWidth - 10, 40, 15);
    textLines.push({
      text: data.condition,
      x: Math.floor(topBoxWidth / 2) - Math.floor(data.condition.length * conditionFontSize * 0.3),
      y: 15,
      fontSize: conditionFontSize
    });
  }
  
  if (fieldConfig.includePrice && data.price) {
    const priceText = data.price.startsWith('$') ? data.price : `$${data.price}`;
    const priceFontSize = calculateOptimalFontSize(priceText, topBoxWidth - 10, 40, 15);
    textLines.push({
      text: priceText,
      x: Math.floor(labelWidth / 2) + 5 + Math.floor((topBoxWidth - priceText.length * priceFontSize * 0.3) / 2),
      y: 15,
      fontSize: priceFontSize
    });
  }

  if (fieldConfig.includeTitle && data.title) {
    const titleFontSize = calculateOptimalFontSize(data.title, labelWidth - 10, 35, 15);
    textLines.push({
      text: data.title,
      x: Math.floor((labelWidth - data.title.length * titleFontSize * 0.3) / 2),
      y: labelHeight - titleBoxHeight + 20,
      fontSize: titleFontSize
    });
  }

  const options: LegacyZPLOptions = {
    textLines,
    ...zplSettings
  };

  if (fieldConfig.barcodeMode !== 'none' && data.barcode) {
    const barcodeY = topBoxHeight + 5;
    const barcodeX = 35;
    
    if (fieldConfig.barcodeMode === 'qr') {
      const availableHeight = barcodeBoxHeight - 35;
      let qrSize = 6;
      
      if (availableHeight < 70) qrSize = 4;
      else qrSize = 6;
      
      options.qrcode = {
        data: data.barcode,
        x: barcodeX,
        y: barcodeY,
        size: qrSize
      };
    } else if (fieldConfig.barcodeMode === 'barcode') {
      const barcodeHeight = Math.min(80, barcodeBoxHeight - 35);
      options.barcode = {
        data: data.barcode,
        x: barcodeX,
        y: barcodeY,
        height: barcodeHeight,
        width: 3,
        type: 'CODE128'
      };
    }
    
    if (fieldConfig.includeSku && data.sku) {
      textLines.push({
        text: `SKU: ${data.sku}`,
        x: Math.floor(labelWidth / 2) - 30,
        y: barcodeY + (fieldConfig.barcodeMode === 'barcode' ? 95 : 105),
        fontSize: 15
      });
    }
  }
  
  return buildLegacyZPL(options);
}
