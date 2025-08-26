import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SCRY = "https://api.scryfall.com";
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/,"");

// --- helpers shared with pokemon function style ---
async function backoffWait(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

async function fetchJsonWithRetry(url: string, tries = 6, baseDelayMs = 500) {
  let last: any;
  for (let i=0;i<tries;i++){
    try {
      const res = await fetch(url);
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
  const chunk = 400;
  for (let i=0;i<rows.length;i+=chunk){
    const { error } = await sb.rpc("catalog_v2_upsert_cards",{ rows: rows.slice(i,i+chunk) as any });
    if (error) throw error;
  }
}

async function queueSelfForSet(code: string) {
  const { error } = await sb.rpc("http_post_async", {
    url: `${FUNCTIONS_BASE}/catalog-sync-mtg?setId=${encodeURIComponent(code)}`,
    headers: { "Content-Type":"application/json" } as any,
    body: {} as any
  });
  if (error) throw error;
}

// --- Scryfall-specific ---
async function syncSet(code: string) {
  // 1) set metadata
  const set = await fetchJsonWithRetry(`${SCRY}/sets/${code}`);
  if (set?.code){
    await upsertSets([{
      id: set.code,
      game: "mtg",
      name: set.name ?? null,
      series: set.set_type ?? null,
      printed_total: null,
      total: set.printed_size ?? set.card_count ?? null,
      release_date: set.released_at ?? null,
      images: { icon_svg_uri: set.icon_svg_uri } as any,
      updated_at: new Date().toISOString()
    }]);
  }

  // 2) cards for this set (paged)
  let url = `${SCRY}/cards/search?order=set&q=e%3A${encodeURIComponent(code)}&unique=prints&include_extras=false&include_variations=false`;
  const rows:any[] = [];
  while (url) {
    const page = await fetchJsonWithRetry(url);
    const data = page?.data ?? [];
    for (const c of data) {
      // pick an image (single-faced vs double-faced)
      let img:any = c.image_uris ?? (Array.isArray(c.card_faces) ? c.card_faces[0]?.image_uris : null) ?? null;
      rows.push({
        id: c.id,                  // Scryfall UUID (unique)
        game: "mtg",
        name: c.name ?? null,
        number: c.collector_number ?? null,
        set_id: c.set ?? code,     // set code
        rarity: c.rarity ?? null,
        supertype: c.type_line ?? null,
        subtypes: null,
        images: img ? { small: img.small, normal: img.normal, large: img.large } : null,
        tcgplayer_product_id: c.tcgplayer_id ?? null,
        tcgplayer_url: c.purchase_uris?.tcgplayer ?? null,
        data: c,
        updated_at: new Date().toISOString(),
      });
    }
    url = page?.has_more ? page?.next_page : null;
  }
  await upsertCards(rows);
  return { setId: code, cards: rows.length, sets: set?.code ? 1 : 0 };
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

    // orchestrate: fetch all sets and enqueue
    const setsPage = await fetchJsonWithRetry(`${SCRY}/sets`);
    const all = setsPage?.data ?? [];
    // optional filter: exclude tokens/arsenal/etc if you prefer
    const filtered = all.filter((s:any)=> true && (!since || (s.released_at && s.released_at >= since)));
    await upsertSets(filtered.map((s:any)=>({
      id: s.code, game: "mtg", name: s.name ?? null, series: s.set_type ?? null,
      printed_total: null, total: s.printed_size ?? s.card_count ?? null,
      release_date: s.released_at ?? null, images: { icon_svg_uri: s.icon_svg_uri } as any,
      updated_at: new Date().toISOString(),
    })));
    for (const s of filtered) await queueSelfForSet(s.code);

    return new Response(JSON.stringify({ mode: since ? "orchestrate_incremental" : "orchestrate_full", queued_sets: filtered.length }), {
      headers: { "Content-Type":"application/json" }
    });
  } catch (e:any) {
    return new Response(JSON.stringify({ error: e?.message || "error" }), { status: 500, headers: { "Content-Type":"application/json" }});
  }
});