import { supabase } from "@/lib/supabase";

export async function invokePSAScrapeV2(body: Record<string, any>, ms = 25000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const url = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/psa-scrape-v2`;

  console.info("[psa:invoke:v2] will POST", url, { msTimeout: ms, body });

  try {
    const { data, error } = await supabase.functions.invoke("psa-scrape-v2", {
      body,
    });
    if (error) {
      console.error("[psa:invoke:v2] ERROR", { name: error.name, message: error.message, status: (error as any)?.status });
      throw error;
    }
    console.info("[psa:invoke:v2] OK", { ok: data?.ok, source: data?.source, diagnostics: data?.diagnostics || null });
    return data;
  } finally {
    clearTimeout(t);
  }
}