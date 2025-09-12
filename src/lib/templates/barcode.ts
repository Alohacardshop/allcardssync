// Barcode label template for 2×1 inch labels
import { buildZPLWithCut, getLabelSizeInDots, type ZPLElement, type Dpi } from '../zpl';

export interface BarcodeData {
  barcode: string;
  title?: string;
  description?: string;
  sku?: string;
  [key: string]: any; // Allow additional properties
}

export interface BarcodeOptions {
  dpi?: Dpi;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
  hasCutter?: boolean;
  barcodeHeight?: number;
}

export function barcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true,
    hasCutter = false,
    barcodeHeight = 60
  } = opts;

  const { widthDots, heightDots } = getLabelSizeInDots('2x1', dpi);

  const elements: ZPLElement[] = [];

  // Title (if provided)
  if (data.title) {
    elements.push({
      kind: 'text',
      x: 10,
      y: 10,
      font: 'A',
      height: 24,
      width: 24,
      data: data.title.substring(0, 30)
    });
  }

  // Main barcode (centered)
  const barcodeX = Math.max(10, (widthDots - 200) / 2);
  const barcodeY = data.title ? 35 : 20;
  elements.push({
    kind: 'barcode128',
    x: barcodeX,
    y: barcodeY,
    height: barcodeHeight,
    humanReadable: true,
    data: data.barcode
  });

  // Description (bottom)
  if (data.description) {
    elements.push({
      kind: 'text',
      x: 10,
      y: heightDots - 25,
      font: 'A',
      height: 16,
      width: 16,
      data: data.description.substring(0, 35)
    });
  }

  // SKU (bottom right)
  if (data.sku) {
    elements.push({
      kind: 'text',
      x: widthDots - 100,
      y: heightDots - 25,
      font: 'A',
      height: 16,
      width: 16,
      data: data.sku
    });
  }

  return buildZPLWithCut({
    dpi,
    widthDots,
    heightDots,
    speedIps,
    darkness,
    copies,
    elements
  }, cutAtEnd ? 'end-of-job' : 'none', hasCutter);
}

// Preset functions for common use cases

// Large barcode variant for warehouse use
export function largeBarcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  return barcodeLabel(data, {
    barcodeHeight: 80,
    darkness: 15,
    hasCutter: true,
    ...opts
  });
}

// Compact barcode for inventory
export function compactBarcodeLabel(data: BarcodeData, opts: BarcodeOptions = {}): string {
  return barcodeLabel(data, {
    barcodeHeight: 45,
    darkness: 10,
    hasCutter: false,
    ...opts
  });
}