import { PrintQueue, PrintQueueOptions } from "./printQueue";
import { zebraService } from "@/lib/printer/zebraService";
import { logger } from "@/lib/logger";

// ZD410: tiny throwaway label in cutter mode to fire ONE cut at end of batch, then revert to tear-off.
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
  logger.debug('Print queue printer configured', { printerName }, 'print-transport');
}

/**
 * Get the currently configured printer name
 */
export function getConfiguredPrinter(): string | null {
  return configuredPrinterName;
}

// QZ Tray transport function
async function qzTrayTransport(payload: string): Promise<void> {
  try {
    logger.debug('QZ Tray transport starting', { 
      payloadLength: payload.length,
      firstChars: payload.substring(0, 50)
    }, 'print-transport');

    // First check for externally configured printer, then fall back to zebraService
    let printerName = configuredPrinterName;
    
    if (!printerName) {
      const config = zebraService.getConfig();
      printerName = config?.name || null;
    }
    
    if (!printerName) {
      const error = 'No printer configured. Please select a printer in Settings.';
      logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
      throw new Error(error);
    }

    logger.info('Sending print job via QZ Tray', { 
      printerName,
      payloadSize: payload.length 
    }, 'print-transport');

    // Send ZPL via QZ Tray
    const result = await zebraService.print(payload, printerName);
    
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }

    logger.info('Print job sent successfully via QZ Tray', { 
      printerName,
      message: result.message
    }, 'print-transport');
  } catch (error) {
    logger.error('Queue: QZ Tray transport error', error instanceof Error ? error : new Error(String(error)), undefined, 'print-transport');
    throw error;
  }
}

export const printQueue = new PrintQueue(qzTrayTransport, DEFAULT_OPTIONS);
