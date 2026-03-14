/**
 * Print API — single entry point for sending ZPL to the configured printer.
 *
 * Supports single and bulk printing. Uses the transport layer (mock/tcp)
 * resolved from env config. Returns structured results per job.
 */
import type { PrinterPrefs } from './types';
import type { PrintResult } from '@/lib/print/transports/types';
import { printQueue } from '@/lib/print/queueInstance';
import { sanitizeLabel } from '@/lib/print/sanitizeZpl';
import { getPrintEnvConfig } from '@/lib/print/envConfig';
import { runPreflight } from '@/lib/print/preflight';
import { logPrintJob } from '@/lib/print/printLog';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ZPL_SNAPSHOT = 4096; // Truncate stored ZPL at 4 KB

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
  const qty = prefs?.copies || 1;

  // Centralized preflight
  const preflight = runPreflight({ zpl, copies: qty });
  if (!preflight.ok) {
    const msg = preflight.errors.join(' ');
    logger.warn('[print] Preflight failed', { title, errors: preflight.errors }, 'print-api');
    return { success: false, error: msg, status: 'error' };
  }

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

    const modeTag = config.mode === 'mock' ? '[MOCK] ' : '';

    logger.info('[print] Job queued', { jobId, title, qty, mode: config.mode }, 'print-api');
    logPrintJob({
      mode: config.mode,
      title,
      quantity: qty,
      success: true,
      zplBytes: safeZpl.length,
      zplSnapshot: safeZpl.slice(0, MAX_ZPL_SNAPSHOT),
    });

    return {
      success: true,
      jobId,
      message: `${modeTag}Queued ${qty} label(s): "${title}" [${config.mode}]`,
      status: 'queued',
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error('[print] Failed to queue job', err instanceof Error ? err : new Error(error), { title }, 'print-api');
    logPrintJob({
      mode: config.mode,
      title,
      quantity: qty,
      success: false,
      error,
      zplBytes: zpl.length,
      zplSnapshot: zpl.slice(0, MAX_ZPL_SNAPSHOT),
    });
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

const MAX_BULK = 200;

/** Send multiple labels in one call. Each item is validated independently. Max 200 items. */
export async function sendBulkZplToPrinter(items: BulkPrintItem[]): Promise<BulkPrintResult> {
  if (!items || items.length === 0) {
    return { success: false, total: 0, queued: 0, failed: 0, results: [] };
  }

  if (items.length > MAX_BULK) {
    return {
      success: false,
      total: items.length,
      queued: 0,
      failed: items.length,
      results: [{
        success: false,
        error: `Bulk print limited to ${MAX_BULK} items. You sent ${items.length} — split into smaller batches.`,
        status: 'error',
      }],
    };
  }

  const config = getPrintEnvConfig();

  // Shared preflight (config-level only, ZPL checked per-item below)
  const configCheck = runPreflight({});
  if (!configCheck.ok) {
    return {
      success: false,
      total: items.length,
      queued: 0,
      failed: items.length,
      results: [{ success: false, error: configCheck.errors.join(' '), status: 'error' }],
    };
  }

  const results: PrintResult[] = [];
  let queued = 0;
  let failed = 0;

  // Validate all items first, then enqueue valid ones as a batch
  const validItems: { zpl: string; qty: number; title: string }[] = [];

  for (const item of items) {
    const itemCheck = runPreflight({ zpl: item.zpl, copies: item.prefs?.copies });
    if (!itemCheck.ok) {
      results.push({ success: false, error: `${item.title}: ${itemCheck.errors.join('; ')}`, status: 'error' });
      failed++;
      continue;
    }
    validItems.push({
      zpl: sanitizeLabel(item.zpl),
      qty: item.prefs?.copies || 1,
      title: item.title,
    });
  }

  // Batch enqueue all valid items
  if (validItems.length > 0) {
    try {
      const queueItems = validItems.map((v) => ({
        zpl: v.zpl,
        qty: v.qty,
        usePQ: true,
      }));

      printQueue.enqueueMany(queueItems);

      const modeTag = config.mode === 'mock' ? '[MOCK] ' : '';
      for (const v of validItems) {
        const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        logPrintJob({
          mode: config.mode,
          title: v.title,
          quantity: v.qty,
          success: true,
          zplBytes: v.zpl.length,
          zplSnapshot: v.zpl.slice(0, MAX_ZPL_SNAPSHOT),
        });
        results.push({
          success: true,
          jobId,
          message: `${modeTag}Queued ${v.qty} label(s): "${v.title}" [${config.mode}]`,
          status: 'queued',
        });
        queued++;
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      for (const v of validItems) {
        logPrintJob({
          mode: config.mode,
          title: v.title,
          quantity: v.qty,
          success: false,
          error,
          zplBytes: v.zpl.length,
          zplSnapshot: v.zpl.slice(0, MAX_ZPL_SNAPSHOT),
        });
        results.push({ success: false, error, status: 'error' });
        failed++;
      }
    }
  }

  logger.info('[print] Bulk job complete', { total: items.length, queued, failed }, 'print-api');

  return { success: failed === 0, total: items.length, queued, failed, results };
}
