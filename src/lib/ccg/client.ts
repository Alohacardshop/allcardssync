import type { CcgCard, CcgLookupResponse } from "./types";

export async function lookupCert(cert: string): Promise<CcgCard> {
  const response = await fetch(`/functions/v1/cgc-lookup/ccg/cards/cert/${encodeURIComponent(cert)}?include=pop,images`);
  
  if (response.status === 404) {
    throw new Error("Certification not found (cards)");
  }
  
  if (response.status === 401 || response.status === 403) {
    throw new Error("CGC auth expired. Retrying…");
  }
  
  if (!response.ok) {
    throw new Error(`CGC error ${response.status}`);
  }
  
  const result: CcgLookupResponse = await response.json();
  
  if (!result.ok || !result.data) {
    throw new Error(result.error || "CGC lookup failed");
  }
  
  return result.data;
}

export async function lookupBarcode(code: string): Promise<CcgCard> {
  const response = await fetch(`/functions/v1/cgc-lookup/ccg/cards/barcode/${encodeURIComponent(code)}?include=pop,images`);
  
  if (response.status === 404) {
    throw new Error("Certification not found (cards)");
  }
  
  if (response.status === 401 || response.status === 403) {
    throw new Error("CGC auth expired. Retrying…");
  }
  
  if (!response.ok) {
    throw new Error(`CGC error ${response.status}`);
  }
  
  const result: CcgLookupResponse = await response.json();
  
  if (!result.ok || !result.data) {
    throw new Error(result.error || "CGC lookup failed");
  }
  
  return result.data;
}