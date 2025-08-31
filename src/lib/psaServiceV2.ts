import { supabase } from "@/integrations/supabase/client";

export async function invokePSAScrapeV2(body: Record<string, any>, ms = 45000) {
  const SUPABASE_URL = "https://dmpoandoydaqxhzdjnmk.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk";
  const url = `${SUPABASE_URL}/functions/v1/psa-scrape-v2`;

  console.info("[psa:invoke:v2] Direct fetch start", {
    url,
    msTimeout: ms,
    preview: { cert: body?.cert, mode: body?.mode }
  });

  const started = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    const rawText = await resp.text();
    console.info("[psa:invoke:v2] Response status", {
      status: resp.status,
      ok: resp.ok,
      durationMs: Date.now() - started,
      bodySnippet: rawText?.slice(0, 400)
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    }

    let data: any = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch (e) {
      console.error("[psa:invoke:v2] JSON parse error", e);
      throw new Error('Invalid JSON returned from edge function');
    }

    console.info("[psa:invoke:v2] Parsed payload", {
      ok: data?.ok,
      source: data?.source,
      isValid: data?.isValid,
      grade: data?.grade,
      diagnostics: data?.diagnostics
    });

    return data;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.error("[psa:invoke:v2] Timeout abort", { ms, totalMs: Date.now() - started });
      throw new Error(`Request timed out after ${ms / 1000}s`);
    }
    console.error("[psa:invoke:v2] Fetch error", { name: error?.name, message: error?.message });
    throw error;
  } finally {
    clearTimeout(timeoutId);
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
      brand_title: psaData.brand ?? psaData.brandTitle,
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