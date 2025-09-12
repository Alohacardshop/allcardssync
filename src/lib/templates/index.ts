// Export all label templates
export * from './priceTag';
export * from './barcode';
export * from './qrShelf';

// Template registry for easy access
export const LABEL_TEMPLATES = {
  priceTag: {
    name: 'Price Tag',
    description: '2×1" price tag with title, price, and barcode',
    size: '2×1 inch',
    generator: async () => (await import('./priceTag')).priceTag
  },
  barcode: {
    name: 'Barcode Label', 
    description: '2×1" barcode-focused label',
    size: '2×1 inch',
    generator: async () => (await import('./barcode')).barcodeLabel
  },
  qrShelf: {
    name: 'QR Shelf Label',
    description: '2.25×1.25" shelf label with QR code',
    size: '2.25×1.25 inch', 
    generator: async () => (await import('./qrShelf')).qrShelfLabel
  },
  largeBarcodeLabel: {
    name: 'Large Barcode',
    description: '2×1" large barcode for warehouse',
    size: '2×1 inch',
    generator: async () => (await import('./barcode')).largeBarcodeLabel
  },
  compactBarcodeLabel: {
    name: 'Compact Barcode',
    description: '2×1" compact barcode for inventory',
    size: '2×1 inch',
    generator: async () => (await import('./barcode')).compactBarcodeLabel
  }
} as const;

export type TemplateKey = keyof typeof LABEL_TEMPLATES;