import { PrintQueue, CutMode } from "./printQueue";
import { sendZpl } from "./printTransport";

// ZD410 end-of-batch cut: minimal label to trigger one cut.
const ZD410_END_CUT_TAIL = `^XA
^MMC
^PW420
^LL016
^FO0,0^GB10,1,1^FS
^PQ1
^MMT
^XZ`;

export const printQueue = new PrintQueue(sendZpl, {
  flushMs: 500,
  batchMax: 120,
  cutMode: "end-of-batch" as CutMode,  // <<— cut once at end of each batch
  endCutTail: ZD410_END_CUT_TAIL,
});