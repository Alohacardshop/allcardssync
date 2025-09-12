// Barcode label template for 2×1 inch labels
import { buildZPLWithCut, text, barcode128, mmToDots } from '../zpl';

export interface BarcodeData {
  barcode: string;
  title?: string;
  description?: string;
  sku?: string;
  [key: string]: any; // Allow additional properties
}

export interface BarcodeOptions {
  dpi?: 203 | 300;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
  barcodeHeight?: number;
}

export function barcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true,
    barcodeHeight = 60
  } = opts;

  const labelWidth = mmToDots(50.8, dpi); // 2 inches
  const labelHeight = mmToDots(25.4, dpi); // 1 inch

  return buildZPLWithCut({
    widthMm: 50.8,
    heightMm: 25.4,
    dpi,
    speedIps,
    darkness,
    copies,
    elements: [
      // Title (if provided)
      ...(data.title ? [text(10, 10, data.title.substring(0, 30), 'A', 24, 0)] : []),
      
      // Main barcode (centered)
      barcode128(
        Math.max(10, (labelWidth - 200) / 2), 
        data.title ? 35 : 20, 
        data.barcode, 
        barcodeHeight, 
        3, 
        true
      ),
      
      // Description (bottom)
      ...(data.description ? [text(10, labelHeight - 25, data.description.substring(0, 35), 'A', 16, 0)] : []),
      
      // SKU (bottom right)
      ...(data.sku ? [text(labelWidth - 100, labelHeight - 25, data.sku, 'A', 16, 0)] : [])
    ]
  }, cutAtEnd);
}

// Large barcode variant for warehouse use
export function largeBarcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  return barcodeLabel(data, {
    barcodeHeight: 80,
    darkness: 15,
    ...opts
  });
}

// Compact barcode for inventory
export function compactBarcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  return barcodeLabel(data, {
    barcodeHeight: 45,
    darkness: 10,
    ...opts
  });
}