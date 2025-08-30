import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = "https://dmpoandoydaqxhzdjnmk.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk";

// Verify Supabase config at startup
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Supabase configuration missing", { 
    hasUrl: !!SUPABASE_URL, 
    hasKey: !!SUPABASE_KEY 
  });
} else {
  console.info("Supabase client initialized", { url: SUPABASE_URL });
}

/**
 * Invoke PSA scrape function with timeout and comprehensive error handling
 */
export async function invokePSAScrape(cert: string, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.info("Calling psa-scrape function", { cert, timeoutMs });
    
    const fetchPromise = supabase.functions.invoke("psa-scrape", {
      body: { cert }
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new Error(`Request timed out after ${timeoutMs / 1000} seconds`));
      });
    });
    
    const { data, error } = await Promise.race([fetchPromise, timeoutPromise]) as any;
    
    if (error) {
      console.error("PSA scrape function error", { 
        name: error.name, 
        message: error.message, 
        status: (error as any)?.status,
        details: (error as any)?.details
      });
      throw error;
    }
    
    console.info("PSA scrape response received", { 
      ok: data?.ok, 
      source: data?.source,
      hasData: !!data,
      hasError: !!data?.error
    });
    
    if (data?.error) {
      throw new Error(data.error);
    }
    
    return data;
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message?.includes('aborted') || error.message?.includes('timed out')) {
      console.warn("PSA scrape request timed out", { cert, timeoutMs });
      throw new Error(`Request timed out after ${timeoutMs / 1000} seconds`);
    }
    
    console.error("PSA scrape request failed", { 
      name: error?.name, 
      message: error?.message,
      cert 
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}