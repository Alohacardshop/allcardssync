
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.pokemontcg.io/v2";
const POKE_KEY = Deno.env.get("POKEMONTCG_API_KEY") || "";
const HDRS: HeadersInit = POKE_KEY ? { "X-Api-Key": POKE_KEY } : {};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE =
  Deno.env.get("SUPABASE_FUNCTIONS_URL")?.replace(/\/+$/, "") ||
  `${SUPABASE_URL.replace(".supabase.co", ".functions.supabase.co")}`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function fetchJsonWithRetry(url: string, headers: HeadersInit, retries = 5, baseDelayMs = 500) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, { headers });
    if (res.ok) return await res.json();
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i))); // expo backoff
      continue;
    }
    throw new Error(`${url} ${res.status} ${await res.text().catch(()=> '')}`);
  }
  throw new Error(`retry_exhausted ${url}`);
}

async function fetchAll(path: string, qs: Record<string, string> = {}) {
  const params = new URLSearchParams({ pageSize: "250", ...qs });
  let page = 1, out: any[] = [];
  for (;;) {
    params.set("page", String(page));
    const url = `${API}/${path}?${params.toString()}`;
    const json: any = await fetchJsonWithRetry(url, HDRS);
    const data = json?.data ?? [];
    out.push(...data);
    if (data.length < 250) break;
    page++;
  }
  return out;
}

async function upsertSets(rows: any[]) {
  if (!rows.length) return;
  const { error } = await sb.rpc("catalog_v2_upsert_sets", { rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 400; // keep payloads modest
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.rpc("catalog_v2_upsert_cards", { rows: chunk as any });
    if (error) throw error;
  }
}

async function logError(setId: string, step: string, err: any, detail?: any) {
  console.error("sync error", { setId, step, err: err?.message || String(err) });
  await sb.rpc('catalog_v2_log_error', { 
    payload: { 
      game: 'pokemon', 
      set_id: setId, 
      step, 
      message: err?.message || String(err), 
      detail 
    } as any 
  });
}

async function syncSingleSet(setId: string) {
  try {
    // 1) set
    const sres = await fetchJsonWithRetry(`${API}/sets/${setId}`, HDRS);
    const s = sres?.data;
    if (!s) return { sets: 0, cards: 0, setId };

    await upsertSets([{
      id: s.id,
      game: "pokemon",
      name: s.name,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      updated_at: new Date().toISOString(),
    }]);

    // 2) cards for set
    const cards = await fetchAll("cards", { q: `set.id:"${setId}"` });
    const cardRows = cards.map((c: any) => ({
      id: c.id,
      game: "pokemon",
      name: c.name,
      number: c.number ?? null,
      set_id: c.set?.id ?? null,
      rarity: c.rarity ?? null,
      supertype: c.supertype ?? null,
      subtypes: c.subtypes ?? null,
      images: c.images ?? null,
      tcgplayer_product_id: c.tcgplayer?.productId ?? null,
      tcgplayer_url: c.tcgplayer?.url ?? null,
      data: c,
      updated_at: new Date().toISOString(),
    }));
    await upsertCards(cardRows);

    return { sets: 1, cards: cardRows.length, setId };
  } catch (err: any) {
    await logError(setId, "sync", err);
    throw err;
  }
}

async function queueSelfForSet(setId: string) {
  const url = `${FUNCTIONS_BASE}/catalog-sync-pokemon?setId=${encodeURIComponent(setId)}`;
  // Queue asynchronously via RPC -> pg_net
  const { error } = await sb.rpc("http_post_async", {
    url,
    headers: { "Content-Type": "application/json" } as any,
    body: {} as any,
  });
  if (error) throw error;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const setId = (url.searchParams.get("setId") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();

    // If called with setId → do that one set (short-running)
    if (setId) {
      const res = await syncSingleSet(setId);
      return new Response(JSON.stringify({ mode: "bySetId", ...res }), { 
        headers: { "Content-Type": "application/json", ...corsHeaders } 
      });
    }

    // Orchestration path (no setId):
    // 1) get all sets (or, if since provided, just recent sets)
    const setQs: Record<string, string> = {};
    if (since) setQs.q = `releaseDate>="${since}"`;
    const sets = await fetchAll("sets", setQs);
    const setIds: string[] = sets.map((s: any) => s.id);

    // 2) upsert basic set rows first (fast)
    await upsertSets(sets.map((s: any) => ({
      id: s.id,
      game: "pokemon",
      name: s.name,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      updated_at: new Date().toISOString(),
    })));

    // 3) enqueue each set as its own job (so the big work happens in many short calls)
    for (const id of setIds) await queueSelfForSet(id);

    // 4) return immediately so we never hit function timeout
    return new Response(JSON.stringify({
      mode: since ? "orchestrate_incremental" : "orchestrate_full",
      queued_sets: setIds.length,
    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), { 
      status: 500, 
      headers: { "Content-Type": "application/json", ...corsHeaders } 
    });
  }
});
