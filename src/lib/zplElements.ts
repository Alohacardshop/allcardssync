// ZPL Elements and Label Generation for ZD410 @ 300 DPI
// This file provides types and functions for creating ZPL labels with visual editing support

// Position interface
export interface ZPLPosition {
  x: number;
  y: number;
}

// Size interface
export interface ZPLSize {
  width: number;
  height: number;
}

// Text element
export interface ZPLTextElement {
  id: string;
  type: 'text';
  position: ZPLPosition;
  font: string;
  fontSize: number;
  fontWidth: number;
  text: string;
  rotation?: number;
  boundingBox?: ZPLSize;
  autoSize?: 'none' | 'shrink-to-fit';
  textOverflow?: 'clip' | 'ellipsis' | 'wrap';
}

// Barcode element
export interface ZPLBarcodeElement {
  id: string;
  type: 'barcode';
  position: ZPLPosition;
  data: string;
  barcodeType: string;
  height: number;
  size?: ZPLSize;
  humanReadable?: boolean;
}

// QR code element
export interface ZPLQRElement {
  id: string;
  type: 'qr';
  position: ZPLPosition;
  data: string;
  model?: number;
  magnification?: number;
  errorCorrection?: string;
}

// Box element
export interface ZPLBoxElement {
  id: string;
  type: 'box';
  position: ZPLPosition;
  size: ZPLSize;
  thickness?: number;
}

// Line element
export interface ZPLLineElement {
  id: string;
  type: 'line';
  position: ZPLPosition;
  size: ZPLSize;
  thickness?: number;
}

// Union type for all elements
export type ZPLElement = ZPLTextElement | ZPLBarcodeElement | ZPLQRElement | ZPLBoxElement | ZPLLineElement;

// Label interface
export interface ZPLLabel {
  width: number;
  height: number;
  dpi: number;
  elements: ZPLElement[];
}

// Helpers for standard 2"x1"
export const LABEL_2x1_203 = { width: 448, height: 203, dpi: 203 } as const;  // 2"×1" @203
export const LABEL_2x1_300 = { width: 600, height: 300, dpi: 300 } as const;  // 2"×1" @300

// Standard label dimensions at 300 DPI (ZD410 default)
export const LABEL_DIMENSIONS = {
  width: 600,   // 2.00" at 300 DPI
  height: 300,  // 1.00" at 300 DPI
  dpi: 300
};

// ZPL font definitions with 300 DPI scaling
export const ZPL_FONTS: Record<string, { baseHeight: number; baseWidth: number }> = {
  '0': { baseHeight: 15, baseWidth: 12 },   // Scalable font (recommended)
  'A': { baseHeight: 14, baseWidth: 10 },   // Fixed font A  
  'B': { baseHeight: 21, baseWidth: 13 },   // Fixed font B
  'C': { baseHeight: 28, baseWidth: 18 },   // Fixed font C
  'D': { baseHeight: 42, baseWidth: 26 },   // Fixed font D
  'E': { baseHeight: 56, baseWidth: 42 },   // Fixed font E
};

// Calculate optimal font size for given text and bounding box
export function calculateOptimalFontSize(text: string, boundingBox: ZPLSize, font: string): { fontSize: number; fontWidth: number } {
  const fontInfo = ZPL_FONTS[font] || ZPL_FONTS['0'];
  
  // Calculate based on width constraint
  const maxFontSizeByWidth = Math.floor((boundingBox.width * fontInfo.baseHeight) / (text.length * fontInfo.baseWidth));
  
  // Calculate based on height constraint  
  const maxFontSizeByHeight = Math.floor(boundingBox.height * 0.8);
  
  // Use the smaller of the two constraints
  const fontSize = Math.min(maxFontSizeByWidth, maxFontSizeByHeight, 60); // Cap at 60 for readability
  const fontWidth = Math.floor((fontSize * fontInfo.baseWidth) / fontInfo.baseHeight);
  
  return {
    fontSize: Math.max(fontSize, 8),  // Minimum readable size
    fontWidth: Math.max(fontWidth, 6)
  };
}

// Helper function to wrap text into multiple lines
export function wrapTextToLines(text: string, maxCharsPerLine: number): string[] {
  if (maxCharsPerLine <= 0) return [text];
  
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    
    if (testLine.length <= maxCharsPerLine) {
      currentLine = testLine;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // Word is longer than max line length, force break
        lines.push(word.substring(0, maxCharsPerLine));
        currentLine = word.substring(maxCharsPerLine);
      }
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [text];
}

// Helper function to process text with overflow handling
export function processTextOverflow(text: string, maxLength: number, overflow: string): string {
  if (text.length <= maxLength) return text;
  
  switch (overflow) {
    case 'ellipsis':
      return text.substring(0, maxLength - 3) + '...';
    case 'clip':
      return text.substring(0, maxLength);
    case 'wrap':
      // For ZPL, we'll return the text as-is and handle wrapping in the generator
      return text;
    default:
      return text;
  }
}

// Generate ZPL code from elements with support for both 203-DPI and 300-DPI
export function generateZPLFromElements(
  label: ZPLLabel,
  xOffset: number = 0,
  yOffset: number = 0,
  cutterSettings?: { enableCutter: boolean; cutMode: 'per_label' | 'batch' }
): string {
  const { width, height, dpi, elements } = label;
  const widthDots = Math.round(width);
  const heightDots = Math.round(height);

  const zpl: string[] = [];
  zpl.push(
    '^XA',
    '^MTD',                 // ZD410 = Direct Thermal
    '^MNY'                  // gap/notch stock
  );

  // Add cutter setup commands if enabled
  if (cutterSettings?.enableCutter) {
    zpl.push('^MMC', '^CN1'); // Set print mode = Cutter, enable cutter
    if (cutterSettings.cutMode === 'per_label') {
      zpl.push('^MCY');  // Cut after every label
    } else {
      zpl.push('^MCN');  // Cut only after batch completion
    }
  }

  zpl.push(
    `^PW${widthDots}`,      // Print width in dots
    `^LL${heightDots}`,     // Label height in dots
    '^LH0,0',
    '^FWN',
    '^PON',
    '^CI28'
  );

  elements.forEach((element) => {
    switch (element.type) {
      case 'text': {
        let fontSize = element.fontSize ?? 18;
        let fontWidth = element.fontWidth ?? fontSize;
        // Scale to ~300 DPI when requested
        if (dpi && dpi >= 300) {
          fontSize = Math.round(fontSize * 1.48);
          fontWidth = Math.round(fontWidth * 1.48);
        }
        const text = element.text ?? '';

        // Single-line (wrapping handled elsewhere if provided)
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^A0N,${fontSize},${fontWidth}`,
          `^FD${text}^FS`
        );
        break;
      }

      case 'barcode': {
        // Height defaults
        let h = element.height ?? 40; // 203 DPI default
        if (dpi && dpi >= 300) h = Math.round(h * 1.48);

        // Use compact barcode module/ratio for 2" width
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          '^BY2,2,40', // module, wide-to-narrow, default bar height baseline
          `^BCN,${h},${element.humanReadable ? 'Y' : 'N'},N,N`,
          `^FD${element.data}^FS`
        );
        break;
      }

      case 'qr': {
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^BQN,${element.model ?? 2},${element.magnification ?? 4}`,
          `^FD${element.data}^FS`
        );
        break;
      }

      case 'box': {
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
      }

      case 'line': {
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
      }
    }
  });

  zpl.push('^PQ1,1,0,Y', '^XZ');
  return zpl.join('\n');
}

// Create default label template for 300 DPI
export function createDefaultLabelTemplate(): ZPLLabel {
  return {
    width: LABEL_DIMENSIONS.width,   // 2" at 300 DPI
    height: LABEL_DIMENSIONS.height, // 1" at 300 DPI  
    dpi: LABEL_DIMENSIONS.dpi,
    elements: [
      {
        id: 'title',
        type: 'text',
        position: { x: 30, y: 20 },
        font: '0',
        rotation: 0,
        fontSize: 24, // 300 DPI sized
        fontWidth: 24,
        text: 'Sample Label',
        boundingBox: { width: 540, height: 60 },
        autoSize: 'shrink-to-fit',
        textOverflow: 'ellipsis'
      },
      {
        id: 'barcode',
        type: 'barcode',
        position: { x: 30, y: 100 },
        data: '1234567890',
        size: { width: 300, height: 120 }, // 300 DPI scaled
        barcodeType: 'CODE128',
        humanReadable: true,
        height: 120
      },
      {
        id: 'subtitle',
        type: 'text', 
        position: { x: 30, y: 240 },
        font: '0',
        rotation: 0,
        fontSize: 18, // 300 DPI sized
        fontWidth: 18,
        text: 'ZD410 @ 300 DPI',
        boundingBox: { width: 540, height: 40 },
        autoSize: 'shrink-to-fit', 
        textOverflow: 'ellipsis'
      }
    ]
  };
}

// Generate a unique ID for elements
export function generateElementId(): string {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}