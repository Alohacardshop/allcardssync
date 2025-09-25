import { PrinterPrefs } from './types';
import { printQueue } from '@/lib/print/queueInstance';

export async function sendZplToPrinter(zpl: string, title: string, prefs?: PrinterPrefs) {
  console.log('🖨️ sendZplToPrinter called with:', {
    title,
    prefs,
    copies: prefs?.copies,
    zplLength: zpl.length
  });
  
  // Convert to queue-compatible format
  const safeZpl = zpl.replace(/\^XZ\s*$/, "").concat("\n^PQ1\n^XZ");
  const qty = prefs?.copies || 1;
  
  // Enqueue the print job
  printQueue.enqueue({ zpl: safeZpl, qty, usePQ: true });
  
  console.log('✅ Print job queued successfully');
  return { success: true, jobId: `queued-${Date.now()}` };
}