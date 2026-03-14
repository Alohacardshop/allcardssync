import { PrintQueue, PrintQueueOptions } from "./printQueue";
import { logger } from "@/lib/logger";
import { getTransport, getTransportMode } from "./transports";

// ZD611/ZD410: tiny throwaway label in cutter mode to fire ONE cut at end of batch, then revert to tear-off.
const ZD410_END_CUT_TAIL = `^XA
^MMC
^PW420
^LL016
^FO0,0^GB10,1,1^FS
^PQ1
^MMT
^XZ`;

// Default print queue options
const DEFAULT_OPTIONS: PrintQueueOptions = {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch",
  endCutTail: ZD410_END_CUT_TAIL,
  maxRetries: 3,
  retryDelayMs: 1000,
  onDeadLetter: (items, error) => {
    logger.error('Print jobs moved to dead letter queue', error, { 
      itemCount: items.length,
      firstItemPreview: items[0]?.zpl?.substring(0, 100)
    }, 'print-dead-letter');
  }
};

// Configurable printer name - can be set externally
let configuredPrinterName: string | null = null;

/**
 * Set the printer name to use for print jobs.
 * This allows external configuration (e.g., from React context) to override
 * the default zebraService config lookup.
 */
export function setConfiguredPrinter(printerName: string | null) {
  configuredPrinterName = printerName;
  // Forward to qzTray transport if it's loaded
  import('./transports/qzTray').then(({ setQzPrinterName }) => {
    setQzPrinterName(printerName);
  }).catch(() => {});
  logger.debug('Print queue printer configured', { printerName }, 'print-transport');
}

/**
 * Get the currently configured printer name
 */
export function getConfiguredPrinter(): string | null {
  return configuredPrinterName;
}

/**
 * Delegating transport — lazily resolves the real transport on first call.
 * This avoids top-level async while still using the factory.
 */
let resolvedTransport: ((payload: string) => Promise<void>) | null = null;

async function delegatingTransport(payload: string): Promise<void> {
  if (!resolvedTransport) {
    resolvedTransport = await getTransport();
    logger.info(`Print transport resolved: ${getTransportMode()}`, undefined, 'print-transport');
  }
  return resolvedTransport(payload);
}

export const printQueue = new PrintQueue(delegatingTransport, DEFAULT_OPTIONS);
