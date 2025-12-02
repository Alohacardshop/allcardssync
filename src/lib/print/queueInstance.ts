import { PrintQueue } from "./printQueue";
import { zebraService } from "@/lib/printer/zebraService";
import { getDirectPrinterConfig } from "@/hooks/usePrinter";
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

// Direct TCP transport function via zebra-tcp edge function
async function directTcpTransport(payload: string): Promise<void> {
  try {
    logger.debug('Direct TCP transport starting', { 
      payloadLength: payload.length,
      firstChars: payload.substring(0, 50)
    }, 'print-transport');

    // Get printer configuration
    const config = await getDirectPrinterConfig();
    
    if (!config) {
      const error = 'No printer configured. Please configure printer IP in Settings.';
      logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
      throw new Error(error);
    }

    logger.info('Sending print job via TCP', { 
      printerIp: config.ip, 
      printerPort: config.port,
      printerName: config.name,
      payloadSize: payload.length 
    }, 'print-transport');

    // Send ZPL directly via TCP
    const result = await zebraService.print(payload, config.ip, config.port);
    
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }

    logger.info('Print job sent successfully via TCP', { 
      printerIp: config.ip,
      message: result.message
    }, 'print-transport');
  } catch (error) {
    logger.error('Queue: Direct TCP transport error', error instanceof Error ? error : new Error(String(error)), undefined, 'print-transport');
    throw error;
  }
}

export const printQueue = new PrintQueue(directTcpTransport, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch",
  endCutTail: ZD410_END_CUT_TAIL,
});
