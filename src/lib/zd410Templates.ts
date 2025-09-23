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
 * Generate raw card label using unified ZPL builder
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
      position: { x: 20, y: 15 },
      font: 'A',
      rotation: 0,
      fontSize: 18,
      fontWidth: 18,
      text: condition
    },
    {
      id: 'price',
      type: 'text',
      position: { x: 300, y: 15 },
      font: 'A',
      rotation: 0,
      fontSize: 20,
      fontWidth: 20,
      text: priceDisplay
    },
    {
      id: 'barcode',
      type: 'barcode',
      position: { x: 20, y: 50 },
      data: barcodeData,
      size: { width: 2, height: 35 },
      barcodeType: 'CODE128',
      humanReadable: false,
      height: 35
    },
    {
      id: 'cardname',
      type: 'text',
      position: { x: 20, y: 95 },
      font: 'A',
      rotation: 0,
      fontSize: 14,
      fontWidth: 14,
      text: cardName
    },
    {
      id: 'sku',
      type: 'text',
      position: { x: 20, y: 120 },
      font: 'A',
      rotation: 0,
      fontSize: 10,
      fontWidth: 10,
      text: sku
    }
  ];

  const label: ZPLLabel = {
    width: 406,  // 2" at 203 DPI
    height: 203, // 1" at 203 DPI
    dpi: 203,
    elements
  };

  return generateZPLFromElements(label, 0, 0);
}

/**
 * Generate test label using unified ZPL builder
 */
export function generateTestLabel(): string {
  const timestamp = new Date().toLocaleString();
  
  const elements: ZPLElement[] = [
    {
      id: 'title',
      type: 'text',
      position: { x: 0, y: 0 },
      font: 'A',
      rotation: 0,
      fontSize: 16,
      fontWidth: 16,
      text: 'TEST PRINT ZD410'
    },
    {
      id: 'timestamp',
      type: 'text',
      position: { x: 0, y: 30 },
      font: 'A',
      rotation: 0,
      fontSize: 12,
      fontWidth: 12,
      text: timestamp
    },
    {
      id: 'footer',
      type: 'text',
      position: { x: 0, y: 60 },
      font: 'A',
      rotation: 0,
      fontSize: 10,
      fontWidth: 10,
      text: 'ZD410 2x1 Test'
    }
  ];

  const label: ZPLLabel = {
    width: 406,  // 2" at 203 DPI
    height: 203, // 1" at 203 DPI
    dpi: 203,
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