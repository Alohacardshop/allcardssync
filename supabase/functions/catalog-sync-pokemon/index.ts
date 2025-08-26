
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.pokemontcg.io/v2";
const POKE_KEY = Deno.env.get("POKEMONTCG_API_KEY") || "";
const HDRS: HeadersInit = POKE_KEY ? { "X-Api-Key": POKE_KEY } : {};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE =
  (Deno.env.get("SUPABASE_FUNCTIONS_URL") || `${SUPABASE_URL.replace(".supabase.co",".functions.supabase.co")}`).replace(/\/+$/,"");

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// ---------- helpers ----------
async function fetchJsonWithRetry(url: string, headers: HeadersInit, {
  tries = 6, baseDelayMs = 500, okOn404 = false
}: { tries?: number; baseDelayMs?: number; okOn404?: boolean } = {}) {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 404 && okOn404) return { data: [], page: 0, pageSize: 0, count: 0, totalCount: 0 };
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
          continue;
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(()=> "")}`);
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
    }
  }
  throw lastErr || new Error(`retry_exhausted ${url}`);
}

async function fetchAll(path: string, qs: Record<string, string> = {}) {
  const pageSize = Number(qs.pageSize || 250);
  const params = new URLSearchParams({ pageSize: String(pageSize), ...qs });

  params.set("page", "1");
  const firstUrl = `${API}/${path}?${params.toString()}`;
  const first = await fetchJsonWithRetry(firstUrl, HDRS, { okOn404: true });
  const out: any[] = [...(first?.data ?? [])];

  const totalCount = Number(first?.totalCount ?? (first?.data?.length ?? 0));
  if (totalCount <= pageSize) return out;

  const lastPage = Math.ceil(totalCount / pageSize);
  for (let page = 2; page <= lastPage; page++) {
    params.set("page", String(page));
    const url = `${API}/${path}?${params.toString()}`;
    const json = await fetchJsonWithRetry(url, HDRS, { okOn404: true });
    const data = json?.data ?? [];
    if (data.length === 0) break;
    out.push(...data);
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
  const chunkSize = 400;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await sb.rpc("catalog_v2_upsert_cards", { rows: chunk as any });
    if (error) throw error;
  }
}

async function queueSelfForSet(setId: string) {
  const { error } = await sb.rpc("http_post_async", {
    url: `${FUNCTIONS_BASE}/catalog-sync-pokemon?setId=${encodeURIComponent(setId)}`,
    headers: { "Content-Type": "application/json" } as any,
    body: {} as any,
  });
  if (error) throw error;
}

async function syncSingleSet(setId: string) {
  // 1) upsert set metadata
  const sres = await fetchJsonWithRetry(`${API}/sets/${setId}`, HDRS);
  const s = (sres as any)?.data;
  if (s) {
    await upsertSets([{
      id: s.id, game: "pokemon", name: s.name, series: s.series ?? null,
      printed_total: s.printedTotal ?? null, total: s.total ?? null,
      release_date: s.releaseDate ?? null, images: s.images ?? null,
      updated_at: new Date().toISOString(),
    }]);
  }

  // 2) upsert cards
  const cards = await fetchAll("cards", { q: `set.id:"${setId}"` });
  const rows = cards.map((c: any) => ({
    id: c.id, game: "pokemon",
    name: c.name, number: c.number ?? null, set_id: c.set?.id ?? null,
    rarity: c.rarity ?? null, supertype: c.supertype ?? null, subtypes: c.subtypes ?? null,
    images: c.images ?? null, tcgplayer_product_id: c.tcgplayer?.productId ?? null,
    tcgplayer_url: c.tcgplayer?.url ?? null, data: c, updated_at: new Date().toISOString(),
  }));
  await upsertCards(rows);

  return { sets: s ? 1 : 0, cards: rows.length, setId };
}

// ---------- HTTP handler ----------
serve(async (req) => {
  try {
    const url = new URL(req.url);
    const setId = (url.searchParams.get("setId") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();

    if (setId) {
      const res = await syncSingleSet(setId);
      return new Response(JSON.stringify({ mode: "bySetId", ...res }), { headers: { "Content-Type": "application/json" } });
    }

    // Orchestrator: enqueue one job per set (optionally filtered by since)
    const setQs: Record<string, string> = {};
    if (since) setQs.q = `releaseDate>="${since}"`;
    const sets = await fetchAll("sets", setQs);
    await upsertSets(sets.map((s: any) => ({
      id: s.id, game: "pokemon", name: s.name, series: s.series ?? null,
      printed_total: s.printedTotal ?? null, total: s.total ?? null,
      release_date: s.releaseDate ?? null, images: s.images ?? null,
      updated_at: new Date().toISOString(),
    })));
    const ids: string[] = sets.map((s: any) => s.id);
    for (const id of ids) await queueSelfForSet(id);

    return new Response(JSON.stringify({
      mode: since ? "orchestrate_incremental" : "orchestrate_full",
      queued_sets: ids.length
    }), { headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
});
