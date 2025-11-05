export type Dpi = 203 | 300;

export type ZPLElement =
  | { kind: 'text'; x: number; y: number; font?: 'A'|'0'; height?: number; width?: number; rotation?: 'N'|'R'|'I'|'B'; data: string; }
  | { kind: 'barcode128'; x: number; y: number; height?: number; moduleWidth?: number; humanReadable?: boolean; data: string; }
  | { kind: 'qrcode'; x: number; y: number; model?: 1|2; mag?: number; data: string; }
  | { kind: 'box'; x: number; y: number; w: number; h: number; thickness?: number; }
  | { kind: 'line'; x: number; y: number; w: number; h: number; };

export interface ZPLOptions {
  dpi: Dpi;               // 203 default
  widthDots: number;      // label width in dots
  heightDots: number;     // label height in dots (→ ^LL)
  speedIps?: number;      // ^PR (e.g. 2–6)
  darkness?: number;      // ^MD 0–30
  copies?: number;        // ^PQ n
  elements: ZPLElement[];
}

export function mmToDots(mm: number, dpi: Dpi): number {
  // Convert millimeters to dots based on DPI
  // 25.4mm = 1 inch
  return Math.round((mm / 25.4) * dpi);
}

export function buildZPL(opts: ZPLOptions): string {
  return buildZPLWithCut(opts, 'none', false, undefined);
}

export function buildZPLWithCut(
  opts: ZPLOptions, 
  cutBehavior: 'none'|'every-label'|'end-of-job', 
  hasCutter: boolean,
  cutterSettings?: { enableCutter: boolean; cutMode: 'per_label' | 'batch' }
): string {
  const lines: string[] = [];
  
  // Start format
  lines.push('^XA');
  
  // Set darkness (0-30, default 10)
  lines.push(`^MD${opts.darkness || 10}`);
  
  // Set print speed (inches per second, default 4)
  lines.push(`^PR${opts.speedIps || 4}`);
  
  // Set print width in dots
  lines.push(`^PW${opts.widthDots}`);
  
  // Set label length in dots
  lines.push(`^LL${opts.heightDots}`);
  
  // Handle cutter settings - use new cutter settings if provided
  if (cutterSettings?.enableCutter) {
    // Set print mode = Cutter
    lines.push('^MMC');
    // Enable cutter
    lines.push('^CN1');
    
    if (cutterSettings.cutMode === 'per_label') {
      lines.push('^MCY'); // Cut after every label
    } else {
      lines.push('^MCN'); // Cut only after batch completion
    }
  } else if (hasCutter && cutBehavior !== 'none') {
    // Fallback to old behavior for backward compatibility
    lines.push('^MMC');
    
    if (cutBehavior === 'every-label') {
      // Default behavior with cutter mode - cuts after each label
      // No additional commands needed, ^MMC enables per-label cutting
    } else if (cutBehavior === 'end-of-job') {
      // Set cut interval to match number of copies to cut only at end
      const copies = opts.copies || 1;
      lines.push(`^MC${copies}`); // Set cut interval
    }
  }
  
  // Process elements
  for (const element of opts.elements) {
    switch (element.kind) {
      case 'text':
        const font = element.font || 'A';
        const rotation = element.rotation || 'N';
        const height = element.height || 20;
        const width = element.width || 20;
        lines.push(`^FO${element.x},${element.y}^A${font}${rotation},${height},${width}^FD${element.data}^FS`);
        break;
        
      case 'barcode128':
        const bcHeight = element.height || 50;
        const moduleWidth = element.moduleWidth || 2;
        const humanReadable = element.humanReadable ? 'Y' : 'N';
        lines.push(`^FO${element.x},${element.y}^BY${moduleWidth}^BCN,${bcHeight},${humanReadable}^FD${element.data}^FS`);
        break;
        
      case 'qrcode':
        const model = element.model || 2;
        const mag = element.mag || 3;
        lines.push(`^FO${element.x},${element.y}^BQN,${model},${mag}^FD${element.data}^FS`);
        break;
        
      case 'box':
        const thickness = element.thickness || 1;
        lines.push(`^FO${element.x},${element.y}^GB${element.w},${element.h},${thickness}^FS`);
        break;
        
      case 'line':
        lines.push(`^FO${element.x},${element.y}^GB${element.w},${element.h},1^FS`);
        break;
    }
  }
  
  // Set quantity (number of copies)
  lines.push(`^PQ${opts.copies || 1}`);
  
  // End format
  lines.push('^XZ');
  
  return lines.join('\n');
}

// Utility functions for common label sizes
export const LABEL_SIZES = {
  '2x1': { widthMm: 50.8, heightMm: 25.4 },      // 2" x 1"
  '2.25x1.25': { widthMm: 57.15, heightMm: 31.75 }, // 2.25" x 1.25"
  '4x6': { widthMm: 101.6, heightMm: 152.4 },    // 4" x 6"
} as const;

export function getLabelSizeInDots(size: keyof typeof LABEL_SIZES, dpi: Dpi) {
  const { widthMm, heightMm } = LABEL_SIZES[size];
  return {
    widthDots: mmToDots(widthMm, dpi),
    heightDots: mmToDots(heightMm, dpi)
  };
}