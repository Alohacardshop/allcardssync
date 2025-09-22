// ZPL Visual Editor Element Types and Utilities

export interface ZPLPosition {
  x: number;
  y: number;
}

export interface ZPLSize {
  width: number;
  height: number;
}

export interface ZPLTextElement {
  id: string;
  type: 'text';
  position: ZPLPosition;
  font: 'A' | '0' | 'B' | 'D' | 'E' | 'F' | 'G' | 'H';
  fontSize: number;
  fontWidth: number;
  text: string;
  rotation: 0 | 90 | 180 | 270;
  boundingBox?: ZPLSize;
  autoSize?: 'none' | 'shrink-to-fit' | 'grow-to-fit';
  textOverflow?: 'clip' | 'ellipsis' | 'wrap' | 'shrink';
  selected?: boolean;
}

export interface ZPLBarcodeElement {
  id: string;
  type: 'barcode';
  position: ZPLPosition;
  size: ZPLSize;
  barcodeType: 'CODE128' | 'CODE39' | 'EAN13' | 'UPC';
  data: string;
  height: number;
  humanReadable: boolean;
  selected?: boolean;
}

export interface ZPLQRElement {
  id: string;
  type: 'qr';
  position: ZPLPosition;
  model: 1 | 2;
  magnification: number;
  data: string;
  selected?: boolean;
}

export interface ZPLBoxElement {
  id: string;
  type: 'box';
  position: ZPLPosition;
  size: ZPLSize;
  thickness: number;
  selected?: boolean;
}

export interface ZPLLineElement {
  id: string;
  type: 'line';
  position: ZPLPosition;
  size: ZPLSize;
  thickness: number;
  selected?: boolean;
}

export type ZPLElement = ZPLTextElement | ZPLBarcodeElement | ZPLQRElement | ZPLBoxElement | ZPLLineElement;

export interface ZPLLabel {
  width: number;
  height: number;
  dpi: number;
  elements: ZPLElement[];
}

// Constants for 2x1 inch label at 203 DPI
export const LABEL_DIMENSIONS = {
  width: 406, // 2 inches * 203 DPI
  height: 203, // 1 inch * 203 DPI
  dpi: 203
};

// ZPL Font mappings
export const ZPL_FONTS = {
  'A': { name: 'Font A', baseWidth: 9, baseHeight: 11 },
  '0': { name: 'Font 0', baseWidth: 12, baseHeight: 20 },
  'B': { name: 'Font B', baseWidth: 7, baseHeight: 9 },
  'D': { name: 'Font D', baseWidth: 10, baseHeight: 12 },
  'E': { name: 'Font E', baseWidth: 8, baseHeight: 10 },
  'F': { name: 'Font F', baseWidth: 26, baseHeight: 39 },
  'G': { name: 'Font G', baseWidth: 60, baseHeight: 40 },
  'H': { name: 'Font H', baseWidth: 21, baseHeight: 13 }
};

// Helper function to calculate optimal font size for text within bounds
export function calculateOptimalFontSize(text: string, boundingBox: ZPLSize, font: string): { fontSize: number; fontWidth: number } {
  const fontInfo = ZPL_FONTS[font as keyof typeof ZPL_FONTS];
  if (!fontInfo || !text.length) return { fontSize: 20, fontWidth: 20 };

  const maxWidth = boundingBox.width;
  const maxHeight = boundingBox.height;
  
  // Calculate maximum font size that fits within bounds
  const maxFontSizeByWidth = Math.floor(maxWidth / (text.length * (fontInfo.baseWidth / fontInfo.baseHeight)));
  const maxFontSizeByHeight = Math.floor(maxHeight);
  
  const optimalSize = Math.min(maxFontSizeByWidth, maxFontSizeByHeight, 50); // Cap at 50
  return { 
    fontSize: Math.max(optimalSize, 8), // Minimum 8pt
    fontWidth: Math.max(optimalSize, 8)
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

// Generate ZPL code from elements with ZD410 defaults
export function generateZPLFromElements(label: ZPLLabel, xOffset: number = 0, yOffset: number = 0): string {
  const { width, height, dpi, elements } = label;
  
  let zpl = [
    '^XA', // Start format
    '^MNY', // Gap media (use ^MNN for continuous) 
    '^MTD', // Direct thermal (ZD410)
    '^MMC', // Enable cutter mode
    '^PW448', // Print width for 2" labels (2.2" at 203 DPI)
    `^LL${height}`, // Label length
    '^LH0,0', // Label home position
    '^PR4', // Print rate (speed)
    '^MD10' // Media darkness
  ];

  elements.forEach(element => {
    switch (element.type) {
      case 'text':
        let fontSize = element.fontSize;
        let fontWidth = element.fontWidth;
        let processedText = element.text;
        
        // Handle auto-sizing if bounding box is defined
        if (element.boundingBox && element.autoSize && element.autoSize !== 'none') {
          if (element.autoSize === 'shrink-to-fit') {
            const optimal = calculateOptimalFontSize(element.text, element.boundingBox, element.font);
            fontSize = optimal.fontSize;
            fontWidth = optimal.fontWidth;
          }
        }
        
        // Handle text overflow and wrapping if bounding box is defined
        if (element.boundingBox && element.textOverflow) {
          const fontInfo = ZPL_FONTS[element.font];
          const charWidth = fontInfo.baseWidth * (fontSize / fontInfo.baseHeight);
          const maxCharsPerLine = Math.floor(element.boundingBox.width / charWidth);
          const maxLines = Math.floor(element.boundingBox.height / fontSize);
          
          if (element.textOverflow === 'wrap') {
            const lines = wrapTextToLines(element.text, maxCharsPerLine);
            const limitedLines = lines.slice(0, maxLines);
            
            // Generate ZPL for each line
            limitedLines.forEach((line, index) => {
              const lineYOffset = element.position.y + (index * fontSize) + yOffset;
              zpl.push(
                `^FO${element.position.x + xOffset},${lineYOffset}`,
                `^A${element.font}${element.rotation === 0 ? 'N' : 'R'},${fontSize},${fontWidth}`,
                `^FD${line}^FS`
              );
            });
            return; // Skip the single-line generation below
          } else {
            processedText = processTextOverflow(element.text, maxCharsPerLine, element.textOverflow);
          }
        }
        
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^A${element.font}${element.rotation === 0 ? 'N' : 'R'},${fontSize},${fontWidth}`,
          `^FD${processedText}^FS`
        );
        break;
      
      case 'barcode':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^BCN,${element.height},${element.humanReadable ? 'Y' : 'N'},N,N`,
          `^FD${element.data}^FS`
        );
        break;
      
      case 'qr':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^BQN,${element.model},${element.magnification}`,
          `^FD${element.data}^FS`
        );
        break;
      
      case 'box':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
      
      case 'line':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
    }
  });

  zpl.push('^PQ1,1,0,Y'); // 1 label, cut after each
  zpl.push('^XZ'); // End format
  return zpl.join('\n');
}

// Create default label template optimized for 2"x1" ZD410 labels
export function createDefaultLabelTemplate(): ZPLLabel {
  return {
    width: LABEL_DIMENSIONS.width,
    height: LABEL_DIMENSIONS.height,
    dpi: LABEL_DIMENSIONS.dpi,
    elements: [
      {
        id: 'condition',
        type: 'text',
        position: { x: 20, y: 15 },
        font: 'A', // Use font A for crisp text
        fontSize: 18,
        fontWidth: 18,
        text: 'NM',
        rotation: 0, // No rotation
        boundingBox: { width: 60, height: 25 },
        autoSize: 'shrink-to-fit',
        textOverflow: 'ellipsis'
      },
      {
        id: 'price',
        type: 'text',
        position: { x: 300, y: 15 },
        font: 'A', // Use font A for crisp text
        fontSize: 20,
        fontWidth: 20,
        text: '$15.99',
        rotation: 0, // No rotation
        boundingBox: { width: 90, height: 25 },
        autoSize: 'shrink-to-fit',
        textOverflow: 'ellipsis'
      },
      {
        id: 'barcode',
        type: 'barcode',
        position: { x: 20, y: 50 },
        size: { width: 250, height: 35 },
        barcodeType: 'CODE128',
        data: '120979260',
        height: 35,
        humanReadable: false
      },
      {
        id: 'title',
        type: 'text',
        position: { x: 20, y: 95 },
        font: 'A', // Use font A for crisp text  
        fontSize: 14,
        fontWidth: 14,
        text: 'POKEMON GENGAR VMAX #020',
        rotation: 0, // No rotation
        boundingBox: { width: 370, height: 45 },
        autoSize: 'shrink-to-fit',
        textOverflow: 'wrap'
      }
    ]
  };
}

// Generate unique ID for elements
export function generateElementId(): string {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}