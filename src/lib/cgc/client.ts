import type { CgcCard, CgcLookupResponse } from "./types";
import { supabase } from "@/integrations/supabase/client";

export async function lookupCert(certNumber: string): Promise<CgcCard> {
  console.log('[CGC:CLIENT] Invoking edge function cgc-lookup (cert)');
  const { data, error } = await supabase.functions.invoke('cgc-lookup', {
    body: { certNumber: certNumber.trim() }
  });

  if (error) {
    console.error('[CGC:CLIENT] invoke error', error);
    throw new Error(error.message || 'CGC lookup failed');
  }

  const response = data as CgcLookupResponse;
  if (!response?.ok || !response.data) {
    throw new Error(response?.error || 'CGC lookup failed');
  }

  return response.data;
}

export async function lookupBarcode(_barcode: string): Promise<CgcCard> {
  console.warn('[CGC:CLIENT] Barcode lookup not supported via scraping');
  throw new Error('CGC barcode lookup not supported via scraping. Please enter the certificate number.');
}
