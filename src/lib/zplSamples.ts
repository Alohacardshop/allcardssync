// Sample ZPL strings for testing
import { buildZPL, text, barcode128 } from './zpl';

// Simple test label
export const simpleTestLabel = `^XA
^LL203^PR4^MD10
^FO20,20^A0N,30,30^FDALOHA CARD SHOP^FS
^FO20,70^BCN,80,Y,N,N^FD123456789012^FS
^PQ1
^XZ`;

// Generated test label using new ZPL builder
export const generatedTestLabel = buildZPL({
  heightDots: 203,
  speedIps: 4,
  darkness: 10,
  elements: [
    text(20, 20, 'ALOHA CARD SHOP', 'A', 30),
    barcode128(20, 70, '123456789012', 80, 2, true)
  ]
});

// Status query command
export const printerStatusQuery = '^XA^HH^XZ';

// Test pattern
export const testPattern = `^XA
^LL203
^FO50,50^GB100,100,3^FS
^FO75,75^A0N,20,20^FDTEST^FS
^PQ1
^XZ`;