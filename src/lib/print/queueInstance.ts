import { PrintQueue } from "./printQueue";
import { print } from "@/lib/printService";

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
    const result = await print(payload, 1); // PrintNode handles quantity via ZPL ^PQ commands
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