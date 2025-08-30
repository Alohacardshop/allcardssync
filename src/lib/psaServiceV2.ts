import { supabase } from "@/integrations/supabase/client";

export async function invokePSAScrapeV2(body: Record<string, any>, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);

  console.info("[psa:invoke:v2] Starting PSA scrape", { 
    cert: body.cert, 
    msTimeout: ms, 
    mode: body.mode 
  });

  try {
    const { data, error } = await supabase.functions.invoke("psa-scrape-v2", {
      body,
    });
    
    if (error) {
      console.error("[psa:invoke:v2] Supabase function error", { 
        name: error.name, 
        message: error.message, 
        status: (error as any)?.status 
      });
      throw error;
    }

    console.info("[psa:invoke:v2] PSA scrape response", { 
      ok: data?.ok, 
      source: data?.source, 
      isValid: data?.isValid,
      grade: data?.grade,
      diagnostics: data?.diagnostics 
    });
    
    return data; // Return the full response object with ok, error, etc.
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error("[psa:invoke:v2] Request timeout after", ms, "ms");
      throw new Error(`PSA scrape timed out after ${ms / 1000}s`);
    }
    console.error("[psa:invoke:v2] Unexpected error", { 
      name: error.name, 
      message: error.message 
    });
    throw error;
  } finally {
    clearTimeout(t);
  }
}

// Get PSA certificate from database
export async function getPSACertificate(certNumber: string) {
  console.info("[psa:db:get] Fetching PSA certificate", { certNumber });
  
  const { data, error } = await supabase
    .from('psa_certificates')
    .select('*')
    .eq('cert_number', certNumber)
    .maybeSingle();
  
  if (error) {
    console.error("[psa:db:get] Database error", error);
    throw error;
  }
  
  return data;
}

// Save PSA certificate to intake_items
export async function savePSAToIntakeItem(itemId: string, psaData: any) {
  console.info("[psa:db:save] Saving PSA data to intake item", { itemId, certNumber: psaData.certNumber });
  
  const { error } = await supabase
    .from('intake_items')
    .update({
      psa_cert_number: psaData.certNumber,
      psa_verified: psaData.isValid,
      psa_last_check: new Date().toISOString(),
      grade: psaData.grade,
      year: psaData.year,
      brand_title: psaData.brandTitle,
      subject: psaData.subject,
      card_number: psaData.cardNumber,
      image_urls: psaData.imageUrls ? JSON.stringify(psaData.imageUrls) : null,
      source_provider: 'scrape',
      source_payload: JSON.stringify(psaData),
      updated_at: new Date().toISOString()
    })
    .eq('id', itemId);
  
  if (error) {
    console.error("[psa:db:save] Failed to save PSA data to intake item", error);
    throw error;
  }
  
  console.info("[psa:db:save] Successfully saved PSA data to intake item");
}