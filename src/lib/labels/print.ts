import { PrinterPrefs } from './types';
import { printQueue } from '@/lib/print/queueInstance';
import { sanitizeLabel } from '@/lib/print/sanitizeZpl';

export async function sendZplToPrinter(zpl: string, title: string, prefs?: PrinterPrefs) {
  console.debug("[print_prepare]", {
    title,
    qty: prefs?.copies || 1,
    preview: zpl.slice(0, 120).replace(/\n/g, "\\n")
  });
  
  // Sanitize and prepare ZPL
  const safeZpl = sanitizeLabel(zpl);
  const qty = prefs?.copies || 1;
  
  // Use safe enqueue to prevent duplicates
  await printQueue.enqueueSafe({ zpl: safeZpl, qty, usePQ: true });
  
  return { success: true, jobId: `queued-${Date.now()}` };
}