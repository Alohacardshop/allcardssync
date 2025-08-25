
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.pokemontcg.io/v2";
const POKE_KEY = Deno.env.get("POKEMONTCG_API_KEY") || "";
const HDRS: HeadersInit = POKE_KEY ? { "X-Api-Key": POKE_KEY } : {};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const setId = (url.searchParams.get("setId") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();

    // --- 1) Sets
    let sets: any[] = [];
    if (setId) {
      const res = await fetch(`${API}/sets/${setId}`, { headers: HDRS });
      if (!res.ok) throw new Error(`sets/${setId} ${res.status}`);
      const j: any = await res.json();
      sets = j?.data ? [j.data] : [];
    } else {
      sets = await fetchAll("sets");
    }
    const setRows = sets.map((s: any) => ({
      id: s.id, game: "pokemon", name: s.name, series: s.series ?? null,
      printed_total: s.printedTotal ?? null, total: s.total ?? null,
      release_date: s.releaseDate ?? null, images: s.images ?? null,
      updated_at: new Date().toISOString(),
    }));
    if (setRows.length) {
      const { error } = await sb.rpc('catalog_v2_upsert_sets', {
        rows: setRows as any
      });
      if (error) throw error;
    }

    // --- 2) Cards
    const cardQs: Record<string,string> = {};
    if (since) cardQs.q = `set.releaseDate>="${since}"`;
    if (setId) cardQs.q = cardQs.q ? `${cardQs.q} AND set.id:"${setId}"` : `set.id:"${setId}"`;

    const cards = await fetchAll("cards", cardQs);
    const cardRows = cards.map((c:any)=>({
      id: c.id, game: "pokemon",
      name: c.name, number: c.number ?? null, set_id: c.set?.id ?? null,
      rarity: c.rarity ?? null, supertype: c.supertype ?? null, subtypes: c.subtypes ?? null,
      images: c.images ?? null, tcgplayer_product_id: c.tcgplayer?.productId ?? null,
      tcgplayer_url: c.tcgplayer?.url ?? null, data: c, updated_at: new Date().toISOString(),
    }));
    
    if (cardRows.length) {
      const chunkSize = 500; // safe payload size
      for (let i = 0; i < cardRows.length; i += chunkSize) {
        const chunk = cardRows.slice(i, i + chunkSize);
        const { error } = await sb.rpc('catalog_v2_upsert_cards', {
          rows: chunk as any
        });
        if (error) throw error;
      }
    }

    return new Response(JSON.stringify({
      mode: setId ? "bySetId" : (since ? "incremental" : "full"),
      sets: setRows.length, cards: cardRows.length
    }), { headers: { "Content-Type":"application/json", ...corsHeaders }});
  } catch (e: any) {
    return new Response(e?.message || "error", { status: 500, headers: { ...corsHeaders } });
  }
});
