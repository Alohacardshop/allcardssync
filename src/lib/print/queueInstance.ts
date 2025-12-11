import { PrintQueue } from "./printQueue";
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

// QZ Tray transport function
async function qzTrayTransport(payload: string): Promise<void> {
  try {
    logger.debug('QZ Tray transport starting', { 
      payloadLength: payload.length,
      firstChars: payload.substring(0, 50)
    }, 'print-transport');

    // Get printer configuration
    const config = zebraService.getConfig();
    
    if (!config?.name) {
      const error = 'No printer configured. Please select a printer in Settings.';
      logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
      throw new Error(error);
    }

    logger.info('Sending print job via QZ Tray', { 
      printerName: config.name,
      payloadSize: payload.length 
    }, 'print-transport');

    // Send ZPL via QZ Tray
    const result = await zebraService.print(payload, config.name);
    
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }

    logger.info('Print job sent successfully via QZ Tray', { 
      printerName: config.name,
      message: result.message
    }, 'print-transport');
  } catch (error) {
    logger.error('Queue: QZ Tray transport error', error instanceof Error ? error : new Error(String(error)), undefined, 'print-transport');
    throw error;
  }
}

export const printQueue = new PrintQueue(qzTrayTransport, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch",
  endCutTail: ZD410_END_CUT_TAIL,
});
