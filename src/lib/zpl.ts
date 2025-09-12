// ZPL (Zebra Programming Language) generator for 2x1 inch labels

export const LABEL_WIDTH_IN = 2;
export const LABEL_HEIGHT_IN = 1;
export const DPI = 203;

// Convert inches to dots at 203 DPI
export const dots = (inches: number): number => Math.round(inches * DPI);

export interface ZPLOptions {
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
  printDensity?: number; // 0-30, default 8
  printSpeed?: number; // 1-14, default 6
  labelLength?: number;
}

export function buildZPL(options: ZPLOptions = {}): string {
  const {
    textLines = [],
    qrcode,
    barcode,
    lines = [],
    printDensity = 8,
    printSpeed = 6,
    labelLength = dots(LABEL_HEIGHT_IN)
  } = options;

  const commands: string[] = [];

  // Header commands
  commands.push('^XA'); // Start format
  commands.push(`^LH0,0`); // Label home position
  commands.push(`^LL${labelLength}`); // Label length
  commands.push(`^PR${printSpeed}`); // Print rate (speed)
  commands.push(`^MD${printDensity}`); // Media darkness (density)

  // Add text elements
  textLines.forEach(({ text, x = 10, y = 20, fontSize = 30, rotation = 0, font = 'A' }) => {
    // ZPL field commands
    commands.push(`^FO${x},${y}`); // Field origin
    if (rotation !== 0) {
      commands.push(`^A${font}${rotation === 90 ? 'R' : rotation === 180 ? 'I' : rotation === 270 ? 'B' : 'N'},${fontSize},${fontSize}`);
    } else {
      commands.push(`^A${font}N,${fontSize},${fontSize}`); // Font
    }
    commands.push(`^FD${text}^FS`); // Field data
  });

  // Add QR code if specified
  if (qrcode) {
    const { data, x = 10, y = 80, size = 5, errorLevel = 'M' } = qrcode;
    commands.push(`^FO${x},${y}`);
    commands.push(`^BQN,2,${size}`); // QR code with normal orientation, model 2, size
    commands.push(`^FDMM,A${errorLevel},${data}^FS`);
  }

  // Add barcode if specified
  if (barcode) {
    const { data, x = 10, y = 80, width = 2, height = 50, type = 'CODE128' } = barcode;
    commands.push(`^FO${x},${y}`);
    
    let barcodeCmd = '^BC';
    switch (type) {
      case 'CODE128':
        barcodeCmd = '^BC';
        break;
      case 'CODE39':
        barcodeCmd = '^B3';
        break;
      case 'EAN13':
        barcodeCmd = '^BE';
        break;
      case 'EAN8':
        barcodeCmd = '^B8';
        break;
    }
    
    commands.push(`${barcodeCmd}N,${height},Y,N,N`);
    commands.push(`^FD${data}^FS`);
  }

  // Add horizontal/vertical lines (graphic boxes)
  lines.forEach(({ x, y, width, height }) => {
    commands.push(`^FO${x},${y}`);
    commands.push(`^GB${width},${height},${height < width ? height : width}^FS`);
  });

  // Print command
  commands.push('^PQ1,0,1,Y'); // Print quantity
  commands.push('^XZ'); // End format

  return commands.join('\n');
}

export function buildSampleLabel(): string {
  return buildZPL({
    textLines: [
      { text: 'ALOHA CARD SHOP', x: 10, y: 20, fontSize: 25 }
    ],
    qrcode: {
      data: 'https://alohacardshop.com',
      x: 10,
      y: 80,
      size: 4
    },
    lines: [
      { x: 10, y: 190, width: 386, height: 2 }
    ]
  });
}

// Unified ZPL generator with field selection
export interface LabelFieldConfig {
  includeTitle: boolean;
  includeSku: boolean;
  includePrice: boolean;
  includeLot: boolean;
  includeCondition: boolean;
  barcodeMode: 'qr' | 'barcode' | 'none';
}

// Layout-based ZPL generation
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
  const textLines: ZPLOptions['textLines'] = [];

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

  // Use layout printer settings if no overrides provided
  const effectiveSettings = {
    ...layout.printer,
    ...zplSettings
  };

  const options: ZPLOptions = {
    textLines,
    ...effectiveSettings
  };

  // Add barcode/QR based on layout
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

  return buildZPL(options);
}

// Calculate optimal font size for text to fit within given width (ZPL version)
function calculateOptimalFontSize(
  text: string,
  maxWidth: number,
  maxFontSize: number = 50,
  minFontSize: number = 15
): number {
  // Approximate character width per font size (in dots at 203 DPI for ZPL)
  const charWidthRatio = 0.6; // ZPL font width ratio
  
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
  const textLines: ZPLOptions['textLines'] = [];
  
  // Label dimensions in dots (2"x1" at 203 DPI)
  const labelWidth = dots(LABEL_WIDTH_IN);  // 406 dots
  const labelHeight = dots(LABEL_HEIGHT_IN); // 203 dots
  
  // Box dimensions and positions
  const topBoxHeight = 50;
  const titleBoxHeight = 60;
  const barcodeBoxHeight = labelHeight - topBoxHeight - titleBoxHeight;
  
  // Top row boxes (condition and price)
  const topBoxWidth = Math.floor(labelWidth / 2) - 5;
  
  // Condition box (top left)
  if (fieldConfig.includeCondition && data.condition) {
    const conditionFontSize = calculateOptimalFontSize(data.condition, topBoxWidth - 10, 40, 15);
    textLines.push({
      text: data.condition,
      x: Math.floor(topBoxWidth / 2) - Math.floor(data.condition.length * conditionFontSize * 0.3),
      y: 15,
      fontSize: conditionFontSize
    });
  }
  
  // Price box (top right)
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

  // Title box (bottom)
  if (fieldConfig.includeTitle && data.title) {
    const titleFontSize = calculateOptimalFontSize(data.title, labelWidth - 10, 35, 15);
    textLines.push({
      text: data.title,
      x: Math.floor((labelWidth - data.title.length * titleFontSize * 0.3) / 2),
      y: labelHeight - titleBoxHeight + 20,
      fontSize: titleFontSize
    });
  }

  const options: ZPLOptions = {
    textLines,
    ...zplSettings
  };

  // Barcode in middle section
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
    
    // Add SKU below barcode if included
    if (fieldConfig.includeSku && data.sku) {
      textLines.push({
        text: `SKU: ${data.sku}`,
        x: Math.floor(labelWidth / 2) - 30,
        y: barcodeY + (fieldConfig.barcodeMode === 'barcode' ? 95 : 105),
        fontSize: 15
      });
    }
  }
  
  return buildZPL(options);
}