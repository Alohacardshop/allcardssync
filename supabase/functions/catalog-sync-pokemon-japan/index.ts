import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const JTCG = "https://api.justtcg.com/v1";
const JHDRS: HeadersInit = { "X-API-Key": Deno.env.get("JUSTTCG_API_KEY")! };
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/,"");

// --- helpers shared with other sync functions ---
async function backoffWait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500) {
  let last: any;
  for (let i=0;i<tries;i++){
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) { await backoffWait(baseDelayMs * 2**i); continue; }
        throw new Error(`${url} ${res.status} ${await res.text().catch(()=> '')}`);
      }
      return await res.json();
    } catch (e) {
      last = e;
      await backoffWait(baseDelayMs * 2**i);
    }
  }
  throw last || new Error(`retry_exhausted ${url}`);
}

async function upsertSets(rows:any[]){
  if (!rows.length) return;
  const { error } = await sb.rpc("catalog_v2_upsert_sets",{ rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows:any[]){
  if (!rows.length) return;
  const chunk = 400;
  for (let i=0;i<rows.length;i+=chunk){
    const { error } = await sb.rpc("catalog_v2_upsert_cards",{ rows: rows.slice(i,i+chunk) as any });
    if (error) throw error;
  }
}

async function queueSelfForSet(setId: string) {
  const { error } = await sb.rpc("http_post_async", {
    url: `${FUNCTIONS_BASE}/catalog-sync-pokemon-japan?setId=${encodeURIComponent(setId)}`,
    headers: { "Content-Type":"application/json" } as any,
    body: {} as any
  });
  if (error) throw error;
}

// --- JustTCG-specific for Pokémon Japan ---
async function syncSet(setId: string) {
  // 1) Fetch all cards for this set from JustTCG
  const response = await fetchJsonWithRetry(`${JTCG}/cards?game=pokemon&region=japan&set=${encodeURIComponent(setId)}&limit=1000`, JHDRS);
  const cards = response?.data || [];
  
  if (!cards.length) {
    return { setId, cards: 0, sets: 0 };
  }

  // 2) Extract set info from first card
  const firstCard = cards[0];
  if (firstCard?.set) {
    await upsertSets([{
      id: setId,
      game: "pokemon_japan",
      name: firstCard.set.name ?? null,
      series: firstCard.set.series ?? null,
      printed_total: null,
      total: null,
      release_date: firstCard.set.releaseDate ?? null,
      images: firstCard.set.images ?? null,
      updated_at: new Date().toISOString()
    }]);
  }

  // 3) Process cards
  const rows = cards.map((c: any) => ({
    id: c.id || `${setId}-${c.number}`,
    game: "pokemon_japan",
    name: c.name ?? null,
    number: c.number ?? null,
    set_id: setId,
    rarity: c.rarity ?? null,
    supertype: c.supertype ?? null,
    subtypes: c.subtypes ?? null,
    images: c.images ?? null,
    tcgplayer_product_id: c.tcgplayerId ?? null,
    tcgplayer_url: null,
    data: c,
    updated_at: new Date().toISOString(),
  }));
  
  await upsertCards(rows);
  return { setId, cards: rows.length, sets: firstCard?.set ? 1 : 0 };
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const setId = (url.searchParams.get("setId")||"").trim();
    const since = (url.searchParams.get("since")||"").trim(); // optional YYYY-MM-DD

    if (setId) {
      const res = await syncSet(setId);
      return new Response(JSON.stringify({ mode:"bySetId", ...res }), { headers: { "Content-Type":"application/json" }});
    }

    // orchestrate: fetch all sets from JustTCG
    const setsResponse = await fetchJsonWithRetry(`${JTCG}/sets?game=pokemon&region=japan`, JHDRS);
    const all = setsResponse?.data ?? [];
    const filtered = all.filter((s:any)=> !since || (s.releaseDate && s.releaseDate >= since));
    await upsertSets(filtered.map((s:any)=>({
      id: s.code || s.id,
      game: "pokemon_japan",
      name: s.name ?? null,
      series: s.series ?? null,
      printed_total: null,
      total: null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      updated_at: new Date().toISOString(),
    })));
    for (const s of filtered) await queueSelfForSet(s.code || s.id);

    return new Response(JSON.stringify({ mode: since ? "orchestrate_incremental" : "orchestrate_full", queued_sets: filtered.length }), {
      headers: { "Content-Type":"application/json" }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), { status: 500, headers: { "Content-Type":"application/json" }});
  }
});