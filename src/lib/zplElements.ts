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

// Generate ZPL code from elements with ZD410 @ 300 DPI defaults
export function generateZPLFromElements(
  label: ZPLLabel, 
  xOffset: number = 0, 
  yOffset: number = 0,
  options?: {
    speed?: number;
    darkness?: number;
    stockMode?: 'gap' | 'continuous';
    copies?: number;
    leftShift?: number;  // Allow configurable left shift
  }
): string {
  const { width, height, elements } = label;
  const dpi = label.dpi || 300;  // Default to 300 DPI for ZD410
  const widthDots = Math.round(width);
  const heightDots = Math.round(height);
  const copies = options?.copies || 1;
  
  // Log dimensions for verification
  console.log('🖨️ ZPL Generation:', { dpi, widthDots, heightDots, stockMode: options?.stockMode || 'gap' });
  
  if (dpi !== 300) {
    console.warn(`⚠️ Non-standard DPI detected: ${dpi}. ZD410 optimized for 300 DPI.`);
  }

  const zpl: string[] = [];
  zpl.push(
    '^XA',                    // Start format
    '^MTD',                   // ZD410 = Direct Thermal
    options?.stockMode === 'continuous' ? '^MNN' : '^MNY', // Stock mode
    '^MMC',                   // Enable cutter mode for ZD410
    `^PW${widthDots}`,        // Print width in dots
    `^LL${heightDots}`,       // Label length in dots
    '^LH0,0',                 // Label home position at 0,0
    `^LS${options?.leftShift ?? (dpi === 203 ? 0 : 24)}`, // Left shift: 0 for 203 DPI, 24 for 300 DPI
    '^FWN',                   // Force normal field orientation
    '^PON',                   // Normal print orientation
    '^CI28',                  // UTF-8 character set
    `^PR${options?.speed || 4}`,   // Print speed
    `^MD${options?.darkness || 10}` // Media darkness
  );

  elements.forEach(element => {
    console.log('🔍 Processing element:', element.id, element.type, element);
    switch (element.type) {
      case 'text':
        let fontSize = element.fontSize;
        let fontWidth = element.fontWidth;
        let processedText = element.text;
        
        console.log('📝 Text element details:', {
          id: element.id,
          font: element.font,
          fontSize,
          fontWidth,
          text: processedText,
          position: element.position
        });
        
        // Handle auto-sizing if bounding box is defined
        if (element.boundingBox && element.autoSize && element.autoSize !== 'none') {
          if (element.autoSize === 'shrink-to-fit') {
            const optimal = calculateOptimalFontSize(element.text, element.boundingBox, element.font);
            fontSize = Math.round(optimal.fontSize * 1.48); // Scale for 300 DPI
            fontWidth = Math.round(optimal.fontWidth * 1.48);
          }
        } else {
          // Scale font sizes for 300 DPI if not auto-sizing
          fontSize = Math.round(fontSize * 1.48);
          fontWidth = Math.round(fontWidth * 1.48);
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
            
            // Generate ZPL for each line - no rotation for ZD410
            limitedLines.forEach((line, index) => {
              const lineYOffset = element.position.y + (index * fontSize) + yOffset;
              zpl.push(
                `^FO${element.position.x + xOffset},${lineYOffset}`,
                `^A0N,${fontSize},${fontWidth}`, // Use A0 (scalable font) with normal orientation
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
          `^A0N,${fontSize},${fontWidth}`, // Use A0 (scalable font) with normal orientation
          `^FD${processedText}^FS`
        );
        break;
      
      case 'barcode':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          '^BY3,3,120', // 300 DPI barcode scaling
          `^BCN,${Math.round(element.height * 1.48)},${element.humanReadable ? 'Y' : 'N'},N,N`, // Scale height for 300 DPI
          `^FD${element.data}^FS`
        );
        break;
      
      case 'qr':
        zpl.push(
          `^FO${element.position.x + xOffset},${element.position.y + yOffset}`,
          `^BQN,${element.model},${element.magnification}`, // Force normal orientation
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

  // Finish with label count and end format
  zpl.push(`^PQ${copies},1,0,Y`);  // Print quantity with copies, cut after each
  zpl.push('^XZ');                 // End format
  
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