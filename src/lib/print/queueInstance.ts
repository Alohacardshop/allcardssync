import { PrintQueue } from "./printQueue";
import { printNodeService } from "@/lib/printNodeService";
import { getPrinterConfig } from "@/lib/printerConfigService";
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

// PrintNode-compatible transport function
async function printNodeTransport(payload: string): Promise<void> {
  let printerId: number | undefined;
  try {
    logger.debug('PrintNode transport starting', { 
      payloadLength: payload.length,
      firstChars: payload.substring(0, 50)
    }, 'print-transport');

    // Get printer configuration from user preferences or localStorage
    const config = await getPrinterConfig();
    
    if (!config) {
      const error = 'No printer configured. Please select a default printer in Admin > Test Hardware.';
      logger.error('Printer config missing', new Error(error), undefined, 'print-transport');
      throw new Error(error);
    }

    logger.debug('Printer config loaded', {
      usePrintNode: config.usePrintNode,
      printNodeId: config.printNodeId,
      printerName: config.printerName
    }, 'print-transport');
    
    if (!config.usePrintNode || !config.printNodeId) {
      const error = 'PrintNode not properly configured. Please select a PrintNode printer in Admin > Test Hardware.';
      logger.error('PrintNode not enabled', new Error(error), { config }, 'print-transport');
      throw new Error(error);
    }

    printerId = config.printNodeId;

    logger.info('Sending print job to PrintNode', { 
      printerId, 
      printerName: config.printerName,
      payloadSize: payload.length 
    }, 'print-transport');

    // Call PrintNode directly - print queue has already handled quantity in ZPL
    const result = await printNodeService.printZPL(payload, config.printNodeId, 1);
    
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }

    logger.info('Print job sent successfully', { 
      printerId, 
      jobId: result.jobId 
    }, 'print-transport');
  } catch (error) {
    logger.error('Queue: PrintNode transport error', error instanceof Error ? error : new Error(String(error)), { printerId }, 'print-transport');
    throw error;
  }
}

export const printQueue = new PrintQueue(printNodeTransport, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch",
  endCutTail: ZD410_END_CUT_TAIL,
});