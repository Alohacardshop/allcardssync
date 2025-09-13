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

// Generate ZPL code from elements
export function generateZPLFromElements(label: ZPLLabel): string {
  const { width, height, dpi, elements } = label;
  
  let zpl = [
    '^XA', // Start format
    '^LH0,0', // Label home position
    `^LL${height}`, // Label length
    '^PR4', // Print rate (speed)
    '^MD10' // Media darkness
  ];

  elements.forEach(element => {
    switch (element.type) {
      case 'text':
        zpl.push(
          `^FO${element.position.x},${element.position.y}`,
          `^A${element.font}${element.rotation === 0 ? 'N' : 'R'},${element.fontSize},${element.fontWidth}`,
          `^FD${element.text}^FS`
        );
        break;
      
      case 'barcode':
        zpl.push(
          `^FO${element.position.x},${element.position.y}`,
          `^BCN,${element.height},${element.humanReadable ? 'Y' : 'N'},N,N`,
          `^FD${element.data}^FS`
        );
        break;
      
      case 'qr':
        zpl.push(
          `^FO${element.position.x},${element.position.y}`,
          `^BQN,${element.model},${element.magnification}`,
          `^FD${element.data}^FS`
        );
        break;
      
      case 'box':
        zpl.push(
          `^FO${element.position.x},${element.position.y}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
      
      case 'line':
        zpl.push(
          `^FO${element.position.x},${element.position.y}`,
          `^GB${element.size.width},${element.size.height},${element.thickness}^FS`
        );
        break;
    }
  });

  zpl.push('^XZ'); // End format
  return zpl.join('\n');
}

// Create default label template
export function createDefaultLabelTemplate(): ZPLLabel {
  return {
    width: LABEL_DIMENSIONS.width,
    height: LABEL_DIMENSIONS.height,
    dpi: LABEL_DIMENSIONS.dpi,
    elements: [
      {
        id: 'condition',
        type: 'text',
        position: { x: 60, y: 30 },
        font: '0',
        fontSize: 20,
        fontWidth: 20,
        text: 'Near Mint',
        rotation: 0
      },
      {
        id: 'price',
        type: 'text',
        position: { x: 280, y: 30 },
        font: '0',
        fontSize: 20,
        fontWidth: 20,
        text: '$15.99',
        rotation: 0
      },
      {
        id: 'barcode',
        type: 'barcode',
        position: { x: 50, y: 80 },
        size: { width: 300, height: 50 },
        barcodeType: 'CODE128',
        data: '120979260',
        height: 50,
        humanReadable: false
      },
      {
        id: 'title',
        type: 'text',
        position: { x: 203, y: 150 },
        font: '0',
        fontSize: 16,
        fontWidth: 16,
        text: 'POKEMON GENGAR VMAX #020',
        rotation: 0
      }
    ]
  };
}

// Generate unique ID for elements
export function generateElementId(): string {
  return `element-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}