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
    // Get printer configuration from user preferences or localStorage
    const config = await getPrinterConfig();
    
    if (!config) {
      throw new Error('No printer configured. Please select a default printer in the printer selection dialog.');
    }
    
    if (!config.usePrintNode || !config.printNodeId) {
      throw new Error('PrintNode not properly configured. Please select a PrintNode printer.');
    }

    printerId = config.printNodeId;

    // Call PrintNode directly - print queue has already handled quantity in ZPL
    const result = await printNodeService.printZPL(payload, config.printNodeId, 1);
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }
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