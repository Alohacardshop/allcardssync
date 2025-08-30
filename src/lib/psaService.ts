import { supabase } from "@/integrations/supabase/client";

export async function invokePSAScrape(body: Record<string, any>, ms = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);

  const started = Date.now();
  console.info("[psa:invoke] start", {
    msTimeout: ms,
    body,
    supabaseUrl: "https://dmpoandoydaqxhzdjnmk.supabase.co",
  });

  try {
    const { data, error } = await supabase.functions.invoke("psa-scrape", {
      body,
    });

    const dt = Date.now() - started;

    if (error) {
      console.error("[psa:invoke] invoke ERROR", {
        name: error.name,
        message: error.message,
        status: (error as any)?.status,
        dt,
      });
      throw error;
    }

    console.info("[psa:invoke] invoke OK", {
      ok: data?.ok,
      source: data?.source,
      diagnostics: data?.diagnostics || null,
      keys: data ? Object.keys(data) : [],
      dt,
    });

    return data;
  } catch (e: any) {
    const dt = Date.now() - started;
    if (e?.name === "AbortError") {
      console.error("[psa:invoke] ABORT after timeout", { dt, ms });
      throw new Error(`Client aborted after ${ms}ms`);
    }
    console.error("[psa:invoke] EXCEPTION", { name: e?.name, message: e?.message, dt });
    throw e;
  } finally {
    clearTimeout(timer);
  }
}