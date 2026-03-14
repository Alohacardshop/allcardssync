/**
 * Test Label Generator
 *
 * Produces a simple ZPL label for verifying printer connectivity.
 * Works in both mock and tcp mode via the standard print pipeline.
 */
import { sendZplToPrinter } from '@/lib/labels/print';
import { getPrintEnvConfig } from './envConfig';
import { escapeZpl } from '@/lib/labels/zpl';
import { MOCK_PRODUCT } from './mockData';
import type { PrintResult } from './transports/types';

/** Escape dynamic text for safe ZPL embedding */
function safeField(value: string): string {
  return escapeZpl(value.replace(/[\r\n]/g, ' '));
}

/** Generate a test label ZPL string (2" × 1" at 203 DPI). */
export function buildTestLabelZpl(printerName?: string): string {
  const now = new Date();
  const timestamp = now.toLocaleString();
  const config = getPrintEnvConfig();
  const name = safeField(printerName || config.printerName || 'Default Printer');
  const modeTag = config.mode === 'mock' ? 'MOCK' : 'LIVE';

  return `^XA
^MMT
^MNY
^PW406
^LL203
^CF0,32
^FO30,15^FDAloha Card Shop^FS
^CF0,24
^FO30,55^FDTest Print [${modeTag}]^FS
^CF0,18
^FO30,90^FD${name}^FS
^FO30,115^FD${safeField(timestamp)}^FS
^BY2,3,40
^FO30,145^BCN,40,Y,N,N^FD${safeField(MOCK_PRODUCT.sku)}^FS
^PQ1
^XZ`;
}

/** Send a test label through the full print pipeline. */
export async function sendTestPrint(printerName?: string): Promise<PrintResult> {
  const zpl = buildTestLabelZpl(printerName);
  return sendZplToPrinter(zpl, 'Test Print');
}
