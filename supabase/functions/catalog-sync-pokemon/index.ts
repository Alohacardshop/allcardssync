
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

async function fetchAll(path: string, qs: Record<string, string> = {}) {
  const params = new URLSearchParams({ pageSize: "250", ...qs });
  let page = 1;
  const out: any[] = [];
  for (;;) {
    params.set("page", String(page));
    const res = await fetch(`${API}/${path}?${params.toString()}`, { headers: HDRS });
    if (!res.ok) throw new Error(`${path} ${res.status}`);
    const json: any = await res.json();
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

async function syncSingleSet(setId: string) {
  // 1) set
  const sres = await fetch(`${API}/sets/${setId}`, { headers: HDRS });
  if (!sres.ok) throw new Error(`sets/${setId} ${sres.status}`);
  const sjson: any = await sres.json();
  const s = sjson?.data;
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
}

async function queueSelfForSet(setId: string) {
  // Use pg_net to fire-and-forget a POST to this same function with setId param
  // Requires pg_net extension (already enabled by Lovable earlier)
  const { data, error } = await sb.rpc("net_http_post", {
    url: `${FUNCTIONS_BASE}/catalog-sync-pokemon?setId=${encodeURIComponent(setId)}`,
    headers: JSON.stringify({ "Content-Type": "application/json" }),
    body: "{}",
  } as any);
  if (error) {
    // fallback to direct fetch (synchronous) if pg_net not available
    await fetch(`${FUNCTIONS_BASE}/catalog-sync-pokemon?setId=${encodeURIComponent(setId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  }
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
