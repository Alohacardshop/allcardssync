import { supabase } from "@/integrations/supabase/client";

export async function invokePSAScrapeV2(body: Record<string, any>, ms = 30000) {
  console.info("[psa:invoke:v2] Starting PSA scrape", { 
    cert: body.cert, 
    msTimeout: ms, 
    mode: body.mode 
  });

  const startTime = Date.now();

  try {
    // Use Promise.race for timeout handling since Supabase client doesn't support AbortSignal directly
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        console.warn("[psa:invoke:v2] Timeout reached after", ms, "ms");
        reject(new Error(`PSA scrape timed out after ${ms / 1000}s`));
      }, ms);
    });

    const apiPromise = supabase.functions.invoke("psa-scrape-v2", {
      body,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.info("[psa:invoke:v2] Making API call to psa-scrape-v2");
    const result = await Promise.race([apiPromise, timeoutPromise]);
    const { data, error } = result as any;
    
    if (error) {
      console.error("[psa:invoke:v2] Supabase function error", { 
        name: error.name, 
        message: error.message, 
        status: (error as any)?.status,
        responseTime: Date.now() - startTime
      });
      
      // Handle different error types
      if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
        throw new Error(`Request timed out after ${(Date.now() - startTime) / 1000}s`);
      }
      if (error.message?.includes('fetch') || error.message?.includes('network')) {
        throw new Error('Network error - please check your connection and try again');
      }
      
      throw error;
    }

    console.info("[psa:invoke:v2] PSA scrape response received", { 
      ok: data?.ok, 
      source: data?.source, 
      isValid: data?.isValid,
      grade: data?.grade,
      responseTime: Date.now() - startTime,
      diagnostics: data?.diagnostics 
    });
    
    return data;
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    
    console.error("[psa:invoke:v2] Error occurred", { 
      name: error.name, 
      message: error.message,
      responseTime,
      timeout: ms
    });

    // Provide more specific error messages
    if (error.message?.includes('timed out')) {
      throw new Error(`Request timed out after ${responseTime / 1000}s. The PSA website may be slow - please try again.`);
    }
    if (error.message?.includes('fetch') || error.message?.includes('network')) {
      throw new Error('Network connection failed. Please check your internet and try again.');
    }
    
    throw error;
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