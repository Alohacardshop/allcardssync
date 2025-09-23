export type Dpi = 203 | 300;
export type TemplateFormat = 'elements' | 'zpl';

export type ZPLElement =
  | { type: 'text'; id?: string; x: number; y: number; font?: string; h?: number; w?: number; text: string; maxWidth?: number }
  | { type: 'barcode'; id?: string; x: number; y: number; height?: number; moduleWidth?: number; hr?: boolean; data: string }
  | { type: 'line'; id?: string; x: number; y: number; x2: number; y2: number; thickness?: number };

export interface LabelLayout {
  width: number;   // dots (e.g., 406 for 2" at 203dpi)
  height: number;  // dots (e.g., 203 for 1")
  dpi: Dpi;
  elements: ZPLElement[];
}

export interface LabelTemplate {
  id: string; 
  name: string; 
  description?: string;
  type: string; 
  format: TemplateFormat;
  layout?: LabelLayout;     // when format=elements
  zpl?: string;             // when format=zpl
  is_default?: boolean;
  updated_at?: string;
  scope?: 'org' | 'local' | 'code';
}

export interface PrinterPrefs {
  usePrintNode?: boolean;
  printNodeId?: number;
  speed?: number;      // -> ^PR
  darkness?: number;   // -> ^MD
  copies?: number;     // -> ^PQ
  media?: 'gap' | 'blackmark' | 'continuous'; // -> ^MN
  leftShift?: number;  // -> ^LS
}

export interface JobVars {
  CARDNAME?: string;
  SETNAME?: string;
  CARDNUMBER?: string;
  CONDITION?: string; 
  PRICE?: string; 
  SKU?: string; 
  BARCODE?: string;
}