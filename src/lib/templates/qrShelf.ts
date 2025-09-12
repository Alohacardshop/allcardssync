// QR shelf label template for 2.25×1.25 inch labels
import { buildZPLWithCut, text, qr, mmToDots } from '../zpl';

export interface QRShelfData {
  qrData: string;
  title: string;
  location?: string;
  category?: string;
  section?: string;
  [key: string]: any; // Allow additional properties
}

export interface QRShelfOptions {
  dpi?: 203 | 300;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
  qrSize?: number;
}

export function qrShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true,
    qrSize = 6
  } = opts;

  const labelWidth = mmToDots(57.15, dpi); // 2.25 inches
  const labelHeight = mmToDots(31.75, dpi); // 1.25 inches

  return buildZPLWithCut({
    widthMm: 57.15,
    heightMm: 31.75,
    dpi,
    speedIps,
    darkness,
    copies,
    elements: [
      // QR Code (left side)
      qr(15, 20, data.qrData, qrSize, 'M'),
      
      // Title (right side, large)
      text(120, 15, data.title.substring(0, 20), 'B', 32, 0),
      
      // Location (right side, medium)
      ...(data.location ? [text(120, 50, `LOC: ${data.location}`, 'A', 24, 0)] : []),
      
      // Category (right side, small)
      ...(data.category ? [text(120, 75, data.category.substring(0, 15), 'A', 20, 0)] : []),
      
      // Section (bottom right)
      ...(data.section ? [text(120, 100, `SEC: ${data.section}`, 'A', 18, 0)] : [])
    ]
  }, cutAtEnd);
}

// Warehouse shelf variant with larger text
export function warehouseShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  return qrShelfLabel(data, {
    qrSize: 7,
    darkness: 12,
    ...opts
  });
}

// Compact shelf label for small items
export function compactShelfLabel(data: QRShelfData, opts: QRShelfOptions = {}): string {
  return qrShelfLabel(data, {
    qrSize: 5,
    darkness: 8,
    ...opts
  });
}