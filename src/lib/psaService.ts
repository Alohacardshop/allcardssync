import { supabase } from "@/integrations/supabase/client";

export async function invokePSAScrape(body: Record<string, any>, ms = 20000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    console.info("[psa:invoke] psa-scrape → body:", body);
    const { data, error } = await supabase.functions.invoke("psa-scrape", {
      body,
    });
    
    if (error) {
      console.error("[psa:invoke] error", { name: error.name, message: error.message, status: (error as any)?.status });
      throw error;
    }
    console.info("[psa:invoke] ok", { ok: data?.ok, source: data?.source, diagnostics: data?.diagnostics });
    return data;
  } finally {
    clearTimeout(timer);
  }
}