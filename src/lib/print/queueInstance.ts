import { PrintQueue } from "./printQueue";
import { sendZpl } from "./printTransport";

const CUT_TAIL = ""; // add model-specific cut command later if needed

export const printQueue = new PrintQueue(sendZpl, {
  flushMs: 500,
  batchMax: 120,
  cutTail: CUT_TAIL,
});