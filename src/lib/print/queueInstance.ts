import { PrintQueue } from "./printQueue";
import { printNodeService } from "@/lib/printNodeService";

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
  try {
    // Get saved PrintNode configuration (same logic as printService.ts)
    const savedConfig = localStorage.getItem('zebra-printer-config');
    if (!savedConfig) {
      throw new Error('No PrintNode printer configured. Please configure in Admin > Test Hardware.');
    }
    
    const config = JSON.parse(savedConfig);
    if (!config.usePrintNode || !config.printNodeId) {
      throw new Error('PrintNode not properly configured. Please reconfigure in Admin > Test Hardware.');
    }

    // Call PrintNode directly - print queue has already handled quantity in ZPL
    const result = await printNodeService.printZPL(payload, config.printNodeId, 1);
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }
  } catch (error) {
    console.error('❌ Queue: PrintNode transport error:', error);
    throw error;
  }
}

export const printQueue = new PrintQueue(printNodeTransport, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch",
  endCutTail: ZD410_END_CUT_TAIL,
});