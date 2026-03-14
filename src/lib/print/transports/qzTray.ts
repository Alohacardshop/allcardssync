/**
 * QZ Tray Transport (TCP mode)
 *
 * Sends raw ZPL to a named Zebra printer via QZ Tray, which delivers
 * it over TCP/9100 to the physical printer. This IS the TCP transport —
 * browsers can't open raw sockets, so QZ Tray acts as the local bridge.
 *
 * Printer name resolution order:
 *   1. Runtime override via setQzPrinterName() (from PrintQueueContext)
 *   2. VITE_ZEBRA_PRINTER_NAME env var (from envConfig)
 *   3. localStorage config (from zebraService)
 */
import { zebraService } from '@/lib/printer/zebraService';
import { logger } from '@/lib/logger';
import { getPrintEnvConfig } from '../envConfig';
import type { PrintTransport } from './types';

/** Timeout for a single print delivery (ms) */
const SEND_TIMEOUT_MS = 15_000;

// Runtime override — injected by the queue instance / PrintQueueContext
let runtimePrinterName: string | null = null;

export function setQzPrinterName(name: string | null) {
  runtimePrinterName = name;
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
  // Resolve printer name: runtime > env > localStorage
  const printerName =
    runtimePrinterName ||
    getPrintEnvConfig().printerName ||
    zebraService.getConfig()?.name ||
    null;

  if (!printerName) {
    const error = 'No printer configured. Set VITE_ZEBRA_PRINTER_NAME or select one in Settings.';
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
