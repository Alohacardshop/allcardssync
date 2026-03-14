/**
 * QZ Tray Transport (TCP mode)
 *
 * Sends raw ZPL to a named Zebra printer via QZ Tray, which delivers
 * it over TCP/9100 to the physical printer. This IS the TCP transport —
 * browsers can't open raw sockets, so QZ Tray acts as the local bridge.
 *
 * Includes timeout protection so a hung printer doesn't block the queue.
 */
import { zebraService } from '@/lib/printer/zebraService';
import { logger } from '@/lib/logger';
import type { PrintTransport } from './types';

/** Timeout for a single print delivery (ms) */
const SEND_TIMEOUT_MS = 15_000;

// Printer name is injected by the queue instance to avoid circular imports
let resolvedPrinterName: string | null = null;

export function setQzPrinterName(name: string | null) {
  resolvedPrinterName = name;
}

/** Race a promise against a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label}: timed out after ${ms}ms`)),
      ms,
    );
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

export const qzTrayTransport: PrintTransport = async (payload) => {
  const printerName = resolvedPrinterName || zebraService.getConfig()?.name || null;

  if (!printerName) {
    const error = 'No printer configured. Please select a printer in Settings.';
    logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
    throw new Error(error);
  }

  logger.info('Sending print job via QZ Tray (TCP/9100)', {
    printerName,
    payloadSize: payload.length,
  }, 'print-transport');

  const result = await withTimeout(
    zebraService.print(payload, printerName),
    SEND_TIMEOUT_MS,
    `QZ Tray → ${printerName}`,
  );

  if (!result.success) {
    throw new Error(result.error || 'Print failed');
  }

  logger.info('Print job delivered via QZ Tray (TCP/9100)', {
    printerName,
    message: result.message,
  }, 'print-transport');
};
