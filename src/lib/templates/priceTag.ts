// Price tag template for 2×1 inch labels
import { buildZPLWithCut, getLabelSizeInDots, type ZPLElement, type Dpi } from '../zpl';

export interface PriceTagData {
  title: string;
  price: string;
  sku?: string;
  condition?: string;
  barcode?: string;
  [key: string]: any; // Allow additional properties
}

export interface PriceTagOptions {
  dpi?: Dpi;
  speedIps?: number;
  darkness?: number;
  copies?: number;
  cutAtEnd?: boolean;
  hasCutter?: boolean;
}

export function priceTag(data: PriceTagData, opts: PriceTagOptions = {}): string {
  const {
    dpi = 203,
    speedIps = 4,
    darkness = 10,
    copies = 1,
    cutAtEnd = true,
    hasCutter = false
  } = opts;

  const { widthDots, heightDots } = getLabelSizeInDots('2x1', dpi);

  const elements: ZPLElement[] = [
    // Title (top section)
    { kind: 'text', x: 10, y: 10, font: 'A', height: 28, width: 28, data: data.title.substring(0, 25) },
    
    // Price (large, prominent)
    { 
      kind: 'text', 
      x: widthDots - 120, 
      y: 15, 
      font: '0', 
      height: 35, 
      width: 35, 
      data: data.price.startsWith('$') ? data.price : `$${data.price}` 
    }
  ];

  // Add condition if provided
  if (data.condition) {
    elements.push({
      kind: 'text',
      x: widthDots - 120,
      y: 55,
      font: 'A',
      height: 18,
      width: 18,
      data: data.condition
    });
  }

  // Add SKU if provided  
  if (data.sku) {
    elements.push({
      kind: 'text',
      x: 10,
      y: heightDots - 30,
      font: 'A',
      height: 16,
      width: 16,
      data: `SKU: ${data.sku}`
    });
  }

  // Add barcode if provided
  if (data.barcode) {
    elements.push({
      kind: 'barcode128',
      x: 10,
      y: heightDots - 80,
      height: 40,
      humanReadable: false,
      data: data.barcode
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

// Standard preset functions for common use cases
export function standardPriceTag(data: PriceTagData, opts: PriceTagOptions = {}): string {
  return priceTag(data, {
    dpi: 203,
    speedIps: 4,
    darkness: 12,
    cutAtEnd: true,
    hasCutter: true,
    ...opts
  });
}