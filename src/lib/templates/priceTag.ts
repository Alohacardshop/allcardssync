// Price tag template for 2×1 inch labels
import { buildZPLWithCut, text, barcode128, mmToDots } from '../zpl';

export interface PriceTagData {
  title: string;
  price: string;
  sku?: string;
  condition?: string;
  barcode?: string;
  [key: string]: any; // Allow additional properties
}

export interface PriceTagOptions {
  dpi?: 203 | 300;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
}

export function priceTag(data: PriceTagData, opts: PriceTagOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true
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
      // Title (top section)
      text(10, 10, data.title.substring(0, 25), 'A', 28, 0),
      
      // Price (large, prominent)
      text(labelWidth - 80, 15, data.price.startsWith('$') ? data.price : `$${data.price}`, 'B', 35, 0),
      
      // Condition (small, top right)
      ...(data.condition ? [text(labelWidth - 80, 45, data.condition, 'A', 18, 0)] : []),
      
      // SKU (bottom left)
      ...(data.sku ? [text(10, labelHeight - 30, `SKU: ${data.sku}`, 'A', 16, 0)] : []),
      
      // Barcode (bottom center)
      ...(data.barcode ? [barcode128(10, labelHeight - 60, data.barcode, 40, 2, false)] : [])
    ]
  }, cutAtEnd);
}

// Preset for common price tag
export function standardPriceTag(data: PriceTagData, opts: PriceTagOptions = {}): string {
  return priceTag(data, {
    dpi: 203,
    speedIps: 4,
    darkness: 12,
    cutAtEnd: true,
    ...opts
  });
}