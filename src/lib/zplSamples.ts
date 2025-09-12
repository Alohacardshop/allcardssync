// ZPL sample generation for testing
import { buildZPL, type ZPLOptions, type ZPLElement, mmToDots } from './zpl';

export function generateSampleZPL(): string {
  const elements: ZPLElement[] = [
    { kind: 'text', x: 20, y: 20, data: 'TEST LABEL', font: 'A', height: 30, width: 30 },
    { kind: 'text', x: 20, y: 60, data: 'Zebra ZD410', font: 'A', height: 20, width: 20 },
    { kind: 'barcode128', x: 20, y: 100, height: 60, humanReadable: true, data: '123456789' }
  ];

  const options: ZPLOptions = {
    dpi: 203,
    widthDots: mmToDots(50.8, 203), // 2 inches
    heightDots: mmToDots(25.4, 203), // 1 inch
    speedIps: 4,
    darkness: 10,
    elements
  };

  return buildZPL(options);
}

// Simple test label
export const simpleTestLabel = `^XA
^LL203^PR4^MD10
^FO20,20^A0N,30,30^FDALOHA CARD SHOP^FS
^FO20,70^BCN,80,Y,N,N^FD123456789012^FS
^PQ1
^XZ`;

// Status query command
export const printerStatusQuery = '^XA^HH^XZ';

// Test pattern
export const testPattern = `^XA
^LL203
^FO50,50^GB100,100,3^FS
^FO75,75^A0N,20,20^FDTEST^FS
^PQ1
^XZ`;