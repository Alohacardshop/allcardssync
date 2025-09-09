import type { CgcCard, CgcLookupResponse } from "./types";

const base = "/functions/v1/cgc-lookup";

export async function lookupCert(certNumber: string): Promise<CgcCard> {
  const r = await fetch(`${base}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      certNumber: certNumber.trim(),
      include: 'pop,images'
    })
  });
  
  if (r.status === 404) throw new Error("CGC certification not found");
  if (r.status === 401 || r.status === 403) throw new Error("CGC auth expired. Retrying...");
  if (r.status >= 500) throw new Error("CGC service unreachable, try again.");
  if (!r.ok) throw new Error(`CGC error ${r.status}`);
  
  const response: CgcLookupResponse = await r.json();
  if (!response.ok || !response.data) {
    throw new Error(response.error || "CGC lookup failed");
  }
  
  return response.data;
}

export async function lookupBarcode(barcode: string): Promise<CgcCard> {
  const r = await fetch(`${base}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      barcode: barcode.trim(),
      include: 'pop,images'
    })
  });
  
  if (r.status === 404) throw new Error("CGC barcode not found");
  if (r.status === 401 || r.status === 403) throw new Error("CGC auth expired. Retrying...");
  if (r.status >= 500) throw new Error("CGC service unreachable, try again.");
  if (!r.ok) throw new Error(`CGC error ${r.status}`);
  
  const response: CgcLookupResponse = await r.json();
  if (!response.ok || !response.data) {
    throw new Error(response.error || "CGC lookup failed");
  }
  
  return response.data;
}