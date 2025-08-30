import { supabase } from "@/integrations/supabase/client";

// Log Supabase config on init
console.info("PSA Service initialized", { 
  url: import.meta.env.VITE_SUPABASE_URL,
  hasKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY
});

/**
 * Invoke PSA scrape function with timeout and comprehensive error handling
 */
export async function invokePSAScrape(cert: string, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    console.info("Calling psa-scrape function", { cert, timeoutMs });
    
    // Get current session for potential auth headers
    const { data: session } = await supabase.auth.getSession();
    
    const invokeOptions: any = {
      body: { cert },
      signal: controller.signal
    };

    // Add auth header if user is logged in (though function is public)
    if (session?.session?.access_token) {
      invokeOptions.headers = {
        'Authorization': `Bearer ${session.session.access_token}`
      };
    }
    
    const { data, error } = await supabase.functions.invoke("psa-scrape", invokeOptions);
    
    if (error) {
      // Log detailed error info for debugging
      console.error("PSA scrape function error", { 
        name: error.name, 
        message: error.message, 
        status: (error as any)?.status,
        details: (error as any)?.details
      });
      
      // Check for specific auth errors
      if ((error as any)?.status === 401 || (error as any)?.status === 403) {
        throw new Error('Authentication error - PSA scraping service unavailable');
      }
      
      throw error;
    }
    
    console.info("PSA scrape response received", { 
      ok: data?.ok, 
      source: data?.source,
      diagnostics: data?.diagnostics,
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
      status: (error as any)?.status,
      cert 
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}