import { PrinterPrefs } from './types';
import { printNodeService } from '@/lib/printNodeService';

export async function sendZplToPrinter(zpl: string, title: string, prefs?: PrinterPrefs) {
  console.log('🖨️ sendZplToPrinter called with:', {
    title,
    prefs,
    copies: prefs?.copies,
    zplLength: zpl.length
  });
  
  const cfg = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');
  
  if (cfg?.usePrintNode && cfg?.printNodeId) {
    try {
      console.log('🖨️ Sending ZPL via PrintNode service...');
      console.log('🖨️ Final copies being sent to PrintNode:', prefs?.copies || 1);
      const result = await printNodeService.printZPL(zpl, cfg.printNodeId, prefs?.copies || 1);
      
      if (result.success) {
        console.log('✅ Print job sent successfully, Job ID:', result.jobId);
        return result;
      } else {
        throw new Error(result.error || 'Print job failed');
      }
    } catch (error) {
      console.error('❌ Print failed:', error);
      throw error;
    }
  }
  
  console.warn('No PrintNode configured. ZPL output:', zpl);
  // Fallback: show ZPL in console for debugging
}