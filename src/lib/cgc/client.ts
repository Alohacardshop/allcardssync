import type { CgcCard, CgcLookupResponse } from "./types";

const TIMEOUT_MS = 20000;

export async function lookupCert(certNumber: string): Promise<CgcCard> {
  console.log('[CGC:CLIENT] Starting CGC cert lookup:', certNumber.trim());
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TIMEOUT_MS);

  try {
    const response = await fetch('/functions/v1/cgc-lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ certNumber: certNumber.trim() }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    
    console.log('[CGC:CLIENT] Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('[CGC:CLIENT] Non-200 response:', response.status, errorText.substring(0, 200));
      throw new Error(`CGC lookup failed: ${response.status}`);
    }

    const data = await response.json() as CgcLookupResponse;
    
    if (!data?.ok || !data.data) {
      throw new Error(data?.error || 'CGC lookup failed - no data returned');
    }

    console.log('[CGC:CLIENT] Successfully retrieved CGC data for:', certNumber);
    return data.data;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      console.log('[CGC:CLIENT] Request timed out after', TIMEOUT_MS, 'ms');
      throw new Error('CGC lookup timed out - please try again');
    }
    
    console.error('[CGC:CLIENT] Lookup error:', error);
    throw error;
  }
}

export async function lookupBarcode(_barcode: string): Promise<CgcCard> {
  console.warn('[CGC:CLIENT] Barcode lookup not supported via scraping');
  throw new Error('CGC barcode lookup not supported via scraping. Please enter the certificate number.');
}
