import { PrintQueue, CutMode } from "./printQueue";
import { print } from "@/lib/printService"; // Use unified print service instead of QZ Tray

// ZD410 end-of-batch cut: minimal label to trigger one cut.
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
  console.log('🖨️ Queue: Processing batch with PrintNode');
  try {
    const result = await print(payload, 1); // PrintNode handles quantity via ZPL ^PQ commands
    if (!result.success) {
      throw new Error(result.error || 'Print failed');
    }
    console.log('✅ Queue: Batch sent successfully to PrintNode');
  } catch (error) {
    console.error('❌ Queue: PrintNode transport error:', error);
    throw error;
  }
}

export const printQueue = new PrintQueue(printNodeTransport, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch" as CutMode,
  endCutTail: ZD410_END_CUT_TAIL,
});