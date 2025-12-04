// Label layout types for the visual editor

export type FieldKey = 'title' | 'sku' | 'price' | 'condition' | 'barcode' | 'set' | 'cardNumber' | 'year' | 'vendor';

export interface LabelField {
  id: string;
  fieldKey: FieldKey;
  x: number; // dots (0-406 for 2" at 203dpi)
  y: number; // dots (0-203 for 1" at 203dpi)
  width: number; // dots
  height: number; // dots
  alignment: 'left' | 'center' | 'right';
  maxFontSize: number; // dots (ZPL font height)
  minFontSize: number; // dots
  letterSpacing?: number; // extra spacing between characters (0-5)
  enabled: boolean;
}

export interface LabelLayout {
  id: string;
  name: string;
  description?: string;
  widthDots: number; // 406 for 2" at 203dpi
  heightDots: number; // 203 for 1" at 203dpi
  dpi: 203 | 300;
  fields: LabelField[];
  labelTopOffset?: number; // ^LT offset in dots (negative = up, positive = down)
  labelLeftOffset?: number; // ^LS offset in dots (negative = left, positive = right)
  createdAt: string;
  updatedAt: string;
}

export interface SampleData {
  title: string;
  sku: string;
  price: string;
  condition: string;
  barcode: string;
  set: string;
  cardNumber: string;
  year: string;
  vendor: string;
}

export const DEFAULT_SAMPLE_DATA: SampleData = {
  title: 'Base Set Charizard #004/102',
  sku: '2999654',
  price: '$350.00',
  condition: 'Moderately Played - Foil',
  barcode: '2999654',
  set: 'Base Set',
  cardNumber: '#004/102',
  year: '1999',
  vendor: 'Pokemon TCG',
};

export const FIELD_LABELS: Record<FieldKey, string> = {
  title: 'Title',
  sku: 'SKU',
  price: 'Price',
  condition: 'Condition',
  barcode: 'Barcode',
  set: 'Set Name',
  cardNumber: 'Card #',
  year: 'Year',
  vendor: 'Vendor',
};

// Default layout for a 2x1 label
export const DEFAULT_LABEL_LAYOUT: LabelLayout = {
  id: 'default-2x1',
  name: 'Default 2x1 Layout',
  description: 'Standard 2" x 1" label with title, price, SKU, and barcode',
  widthDots: 406,
  heightDots: 203,
  dpi: 203,
  labelTopOffset: 0,
  labelLeftOffset: 0,
  fields: [
    {
      id: 'field-title',
      fieldKey: 'title',
      x: 8,
      y: 8,
      width: 260,
      height: 40,
      alignment: 'left',
      maxFontSize: 28,
      minFontSize: 14,
      enabled: true,
    },
    {
      id: 'field-price',
      fieldKey: 'price',
      x: 280,
      y: 8,
      width: 118,
      height: 45,
      alignment: 'right',
      maxFontSize: 36,
      minFontSize: 20,
      enabled: true,
    },
    {
      id: 'field-condition',
      fieldKey: 'condition',
      x: 8,
      y: 52,
      width: 152,
      height: 50,
      alignment: 'center',
      maxFontSize: 24,
      minFontSize: 10,
      enabled: true,
    },
    {
      id: 'field-sku',
      fieldKey: 'sku',
      x: 8,
      y: 170,
      width: 150,
      height: 24,
      alignment: 'left',
      maxFontSize: 18,
      minFontSize: 12,
      enabled: true,
    },
    {
      id: 'field-barcode',
      fieldKey: 'barcode',
      x: 140,
      y: 85,
      width: 260,
      height: 70,
      alignment: 'center',
      maxFontSize: 50,
      minFontSize: 30,
      enabled: true,
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
