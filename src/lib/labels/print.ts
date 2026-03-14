/**
 * Print API — single entry point for sending ZPL to the configured printer.
 *
 * Supports single and bulk printing. Uses the transport layer (mock/tcp)
 * resolved from env config. Returns structured results per job.
 *
 * Future: accept `printerId` in PrintRequest to route to specific printers.
 */
import type { PrinterPrefs } from './types';
import type { PrintRequest, PrintResult } from '@/lib/print/transports/types';
import { printQueue } from '@/lib/print/queueInstance';
import { sanitizeLabel } from '@/lib/print/sanitizeZpl';
import { getPrintEnvConfig, isPrintConfigValid, getPrintConfigWarnings } from '@/lib/print/envConfig';
import { logPrintJob } from '@/lib/print/printLog';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateZpl(zpl: string): string | null {
  if (!zpl || typeof zpl !== 'string') return 'ZPL payload is required';
  const trimmed = zpl.trim();
  if (trimmed.length === 0) return 'ZPL payload is empty';
  if (!trimmed.includes('^XA')) return 'Invalid ZPL: missing ^XA start command';
  return null;
}

// ---------------------------------------------------------------------------
// Single print
// ---------------------------------------------------------------------------

/** Send a single label to the configured printer. */
export async function sendZplToPrinter(
  zpl: string,
  title: string,
  prefs?: PrinterPrefs,
): Promise<PrintResult> {
  const config = getPrintEnvConfig();

  // Validate config
  if (config.mode !== 'mock' && !isPrintConfigValid()) {
    const warnings = getPrintConfigWarnings();
    const msg = warnings.map((w) => `${w.field}: ${w.message}`).join('; ');
    logger.error('[print] Invalid printer config', new Error(msg), undefined, 'print-api');
    return { success: false, error: `Printer misconfigured: ${msg}`, status: 'error' };
  }

  // Validate ZPL
  const zplError = validateZpl(zpl);
  if (zplError) {
    logger.warn('[print] Validation failed', { title, error: zplError }, 'print-api');
    return { success: false, error: zplError, status: 'error' };
  }

  const qty = prefs?.copies || 1;

  logger.debug('[print] Preparing job', {
    title,
    qty,
    mode: config.mode,
    preview: zpl.slice(0, 120).replace(/\n/g, '\\n'),
  }, 'print-api');

  try {
    const safeZpl = sanitizeLabel(zpl);
    const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await printQueue.enqueueSafe({ zpl: safeZpl, qty, usePQ: true });

    logger.info('[print] Job queued', { jobId, title, qty, mode: config.mode }, 'print-api');

    return {
      success: true,
      jobId,
      message: `Queued ${qty} label(s): "${title}" [${config.mode}]`,
      status: 'queued',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('[print] Failed to queue job', err instanceof Error ? err : new Error(error), { title }, 'print-api');
    return { success: false, error, status: 'error' };
  }
}

// ---------------------------------------------------------------------------
// Bulk print
// ---------------------------------------------------------------------------

export interface BulkPrintItem {
  zpl: string;
  title: string;
  prefs?: PrinterPrefs;
}

export interface BulkPrintResult {
  success: boolean;
  total: number;
  queued: number;
  failed: number;
  results: PrintResult[];
}

/** Send multiple labels in one call. Each item is validated independently. */
export async function sendBulkZplToPrinter(items: BulkPrintItem[]): Promise<BulkPrintResult> {
  if (!items || items.length === 0) {
    return { success: false, total: 0, queued: 0, failed: 0, results: [] };
  }

  const results: PrintResult[] = [];
  let queued = 0;
  let failed = 0;

  // Validate all items first, then enqueue valid ones as a batch
  const validItems: { zpl: string; qty: number; title: string }[] = [];

  for (const item of items) {
    const zplError = validateZpl(item.zpl);
    if (zplError) {
      results.push({ success: false, error: `${item.title}: ${zplError}`, status: 'error' });
      failed++;
      continue;
    }
    validItems.push({
      zpl: sanitizeLabel(item.zpl),
      qty: item.prefs?.copies || 1,
      title: item.title,
    });
  }

  // Batch enqueue all valid items at once for efficiency
  if (validItems.length > 0) {
    try {
      const queueItems = validItems.map((v) => ({
        zpl: v.zpl,
        qty: v.qty,
        usePQ: true,
      }));

      printQueue.enqueueMany(queueItems);

      const config = getPrintEnvConfig();
      for (const v of validItems) {
        const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        results.push({
          success: true,
          jobId,
          message: `Queued ${v.qty} label(s): "${v.title}" [${config.mode}]`,
          status: 'queued',
        });
        queued++;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      for (const v of validItems) {
        results.push({ success: false, error, status: 'error' });
        failed++;
      }
    }
  }

  logger.info('[print] Bulk job complete', {
    total: items.length,
    queued,
    failed,
  }, 'print-api');

  return {
    success: failed === 0,
    total: items.length,
    queued,
    failed,
    results,
  };
}
