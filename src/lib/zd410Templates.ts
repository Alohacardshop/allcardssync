/**
 * ZD410 Test Templates
 * Thin wrappers around generateZPLFromElements for quick test printing
 */

import { generateZPLFromElements, ZPLLabel, ZPLElement } from '@/lib/zplElements';

export interface LabelData {
  cardName?: string;
  setName?: string;
  condition?: string;
  price?: number;
  sku?: string;
  barcode?: string;
}

/**
 * Generate raw card label using unified ZPL builder at 300 DPI
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

  const elements: ZPLElement[] = [
    {
      id: 'condition',
      type: 'text',
      position: { x: 30, y: 15 },
      font: '0',
      rotation: 0,
      fontSize: 27, // 300 DPI scaled (18 * 1.5)
      fontWidth: 27,
      text: condition
    },
    {
      id: 'price',
      type: 'text',
      position: { x: 450, y: 15 },
      font: '0',
      rotation: 0,
      fontSize: 30, // 300 DPI scaled (20 * 1.5)
      fontWidth: 30,
      text: priceDisplay
    },
    {
      id: 'barcode',
      type: 'barcode',
      position: { x: 30, y: 75 },
      data: barcodeData,
      size: { width: 3, height: 52 }, // 300 DPI scaled
      barcodeType: 'CODE128',
      humanReadable: false,
      height: 52
    },
    {
      id: 'cardname',
      type: 'text',
      position: { x: 30, y: 142 },
      font: '0',
      rotation: 0,
      fontSize: 21, // 300 DPI scaled (14 * 1.5)
      fontWidth: 21,
      text: cardName
    },
    {
      id: 'sku',
      type: 'text',
      position: { x: 30, y: 180 },
      font: '0',
      rotation: 0,
      fontSize: 15, // 300 DPI scaled (10 * 1.5)
      fontWidth: 15,
      text: sku
    }
  ];

  const label: ZPLLabel = {
    width: 600,  // 2" at 300 DPI
    height: 300, // 1" at 300 DPI
    dpi: 300,
    elements
  };

  return generateZPLFromElements(label, 0, 0);
}

/**
 * Generate test label using unified ZPL builder at 300 DPI
 */
export function generateTestLabel(): string {
  const timestamp = new Date().toLocaleString();
  
  const elements: ZPLElement[] = [
    {
      id: 'title',
      type: 'text',
      position: { x: 30, y: 0 },
      font: '0', // Scalable font
      rotation: 0,
      fontSize: 24, // 300 DPI sized
      fontWidth: 24,
      text: 'TEST PRINT ZD410'
    },
    {
      id: 'timestamp',
      type: 'text',
      position: { x: 30, y: 45 },
      font: '0',
      rotation: 0,
      fontSize: 18, // 300 DPI sized
      fontWidth: 18,
      text: timestamp
    },
    {
      id: 'footer',
      type: 'text',
      position: { x: 30, y: 90 },
      font: '0',
      rotation: 0,
      fontSize: 16, // 300 DPI sized
      fontWidth: 16,
      text: 'ZD410 2x1 @ 300dpi'
    }
  ];

  const label: ZPLLabel = {
    width: 600,  // 2" at 300 DPI
    height: 300, // 1" at 300 DPI
    dpi: 300,
    elements
  };

  return generateZPLFromElements(label, 0, 0);
}

/**
 * Legacy compatibility function
 */
export const zd410TestLabelZPL = (timestamp?: string) => {
  return generateTestLabel();
};