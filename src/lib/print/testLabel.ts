/**
 * Test Label Generator
 *
 * Produces a simple ZPL label for verifying printer connectivity.
 * Works in both mock and tcp mode via the standard print pipeline.
 */
import { sendZplToPrinter } from '@/lib/labels/print';
import { getPrintEnvConfig } from './envConfig';
import type { PrintResult } from './transports/types';

/** Generate a test label ZPL string (2" × 1" at 203 DPI). */
export function buildTestLabelZpl(printerName?: string): string {
  const now = new Date();
  const timestamp = now.toLocaleString();
  const config = getPrintEnvConfig();

  return `^XA
^MMT
^MNY
^PW406
^LL203
^CF0,32
^FO30,15^FDAloha Card Shop^FS
^CF0,24
^FO30,55^FDTest Print — ${config.mode} mode^FS
^CF0,18
^FO30,90^FD${printerName || config.printerName || 'Default Printer'}^FS
^FO30,115^FD${timestamp}^FS
^BY2,3,40
^FO30,145^BCN,40,Y,N,N^FDTEST-${now.getTime().toString(36).toUpperCase()}^FS
^PQ1
^XZ`;
}

/** Send a test label through the full print pipeline. */
export async function sendTestPrint(printerName?: string): Promise<PrintResult> {
  const zpl = buildTestLabelZpl(printerName);
  return sendZplToPrinter(zpl, 'Test Print');
}
