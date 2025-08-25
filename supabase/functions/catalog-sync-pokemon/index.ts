import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://api.pokemontcg.io/v2";
const POKE_KEY = Deno.env.get("POKEMONTCG_API_KEY") || "";
const HDRS: HeadersInit = POKE_KEY ? { "X-Api-Key": POKE_KEY } : {};

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
  try {
    const url = new URL(req.url);
    const since = (url.searchParams.get("since") || "").trim();

    // 1) Sets
    const sets = await fetchAll("sets");
    const setRows = sets.map((s: any) => ({
      id: s.id,
      game: "pokemon",
      name: s.name,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      updated_at: new Date().toISOString(),
    }));
    {
      const { error } = await sb.from("catalog_v2.sets").upsert(setRows, { onConflict: "id" });
      if (error) throw error;
    }

    // 2) Cards (optionally incremental by set releaseDate)
    const cardsQs: Record<string, string> = {};
    if (since) cardsQs.q = `set.releaseDate>="${since}"`;
    const cards = await fetchAll("cards", cardsQs);
    const cardRows = cards.map((c: any) => ({
      id: c.id,
      game: "pokemon",
      name: c.name,
      number: c.number ?? null,
      set_id: c.set?.id ?? null,
      rarity: c.rarity ?? null,
      supertype: c.supertype ?? null,
      subtypes: c.subtypes ?? null,
      images: c.images ?? null,                     // { small, large }
      tcgplayer_product_id: c.tcgplayer?.productId ?? null,
      tcgplayer_url: c.tcgplayer?.url ?? null,
      data: c,                                      // keep raw for future classifiers
      updated_at: new Date().toISOString(),
    }));
    if (cardRows.length) {
      // Upsert in chunks to avoid payload limits
      const chunkSize = 1000;
      for (let i = 0; i < cardRows.length; i += chunkSize) {
        const chunk = cardRows.slice(i, i + chunkSize);
        const { error } = await sb.from("catalog_v2.cards").upsert(chunk, { onConflict: "id" });
        if (error) throw error;
      }
    }

    return new Response(JSON.stringify({ sets: setRows.length, cards: cardRows.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(e?.message || "error", { status: 500 });
  }
});