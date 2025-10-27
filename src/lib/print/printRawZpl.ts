// printRawZpl.ts
import { applySafeProfile, assertSingleFormat, ensurePQ1, sha1Hex } from "./zplUtils";
import { sendZpl } from "./printTransport";
import { logger } from "@/lib/logger";

const duplicateCache = new Map<string, number>(); // hash -> expiry (ms)
const SUPPRESS_MS = 3000;

function getSafeMode(): boolean {
  return localStorage.getItem("safePrintMode") === "true";
}

function now() { return Date.now(); }

function pruneCache() {
  const t = now();
  for (const [k, exp] of duplicateCache.entries()) if (exp <= t) duplicateCache.delete(k);
}

export async function printRawZpl(zpl: string) {
  pruneCache();

  const jobId = crypto.randomUUID();
  logger.info("[print_start]", { jobId }, 'print-raw-zpl');

  // Validations and transforms
  assertSingleFormat(zpl);
  zpl = ensurePQ1(zpl);
  zpl = applySafeProfile(zpl, getSafeMode());

  const hash = await sha1Hex(zpl);
  const exp = duplicateCache.get(hash);
  if (exp && exp > now()) {
    logger.warn("[print_suppressed_duplicate]", { jobId, hash }, 'print-raw-zpl');
    return;
  }
  duplicateCache.set(hash, now() + SUPPRESS_MS);

  // Log a small preview
  logger.debug("[print_payload_preview]", { jobId, hash, preview: zpl.slice(0, 120).replace(/\n/g, "\\n") }, 'print-raw-zpl');

  try {
    await sendZpl(zpl);
    logger.info("[print_sent]", { jobId, hash }, 'print-raw-zpl');
  } catch (err) {
    logger.error("[print_error]", err instanceof Error ? err : new Error(String(err)), { jobId, hash }, 'print-raw-zpl');
    throw err;
  }
}