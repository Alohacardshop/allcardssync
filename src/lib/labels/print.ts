import { PrinterPrefs } from './types';

// Base64 encoding for UTF-8 content (existing utility)
function toBase64Utf8(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function sendZplToPrinter(zpl: string, title: string, prefs?: PrinterPrefs) {
  const cfg = JSON.parse(localStorage.getItem('zebra-printer-config') || '{}');
  
  if (cfg?.usePrintNode && cfg?.printNodeId) {
    const body = {
      printerId: cfg.printNodeId,
      title,
      contentType: 'raw_base64',
      content: toBase64Utf8(zpl),
      source: 'Aloha Label Studio',
    };
    
    try {
      const response = await fetch('/api/printnode/print', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(body) 
      });
      
      if (!response.ok) {
        throw new Error(`Print request failed: ${response.statusText}`);
      }
      
      console.log('Print job sent successfully');
    } catch (error) {
      console.error('Print failed:', error);
      throw error;
    }
    return;
  }
  
  console.warn('No PrintNode configured. ZPL output:', zpl);
  // Fallback: show ZPL in console for debugging
}