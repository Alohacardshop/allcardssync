// QR shelf label template for 2.25×1.25 inch labels
import { buildZPLWithCut, getLabelSizeInDots, type ZPLElement, type Dpi } from '../zpl';

export interface QRShelfData {
  qrData: string;
  title: string;
  location?: string;
  category?: string;
  section?: string;
  [key: string]: any; // Allow additional properties
}

export interface QRShelfOptions {
  dpi?: Dpi;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
  hasCutter?: boolean;
  qrSize?: number;
}

export function qrShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true,
    hasCutter = false,
    qrSize = 6
  } = opts;

  const { widthDots, heightDots } = getLabelSizeInDots('2.25x1.25', dpi);

  const elements: ZPLElement[] = [
    // QR Code (left side)
    {
      kind: 'qrcode',
      x: 15,
      y: 20,
      model: 2,
      mag: qrSize,
      data: data.qrData
    },
    
    // Title (right side, large)
    {
      kind: 'text',
      x: 120,
      y: 15,
      font: '0',
      height: 32,
      width: 32,
      data: data.title.substring(0, 20)
    }
  ];

  // Location (right side, medium)
  if (data.location) {
    elements.push({
      kind: 'text',
      x: 120,
      y: 50,
      font: 'A',
      height: 24,
      width: 24,
      data: `LOC: ${data.location}`
    });
  }

  // Category (right side, small)
  if (data.category) {
    elements.push({
      kind: 'text',
      x: 120,
      y: 75,
      font: 'A',
      height: 20,
      width: 20,
      data: data.category.substring(0, 15)
    });
  }

  // Section (bottom right)
  if (data.section) {
    elements.push({
      kind: 'text',
      x: 120,
      y: 100,
      font: 'A',
      height: 18,
      width: 18,
      data: `SEC: ${data.section}`
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

// Warehouse shelf variant with larger text
export function warehouseShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  return qrShelfLabel(data, {
    qrSize: 7,
    darkness: 12,
    hasCutter: true,
    ...opts
  });
}

// Compact shelf label for small items
export function compactShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  return qrShelfLabel(data, {
    qrSize: 5,
    darkness: 8,
    hasCutter: false,
    ...opts
  });
}