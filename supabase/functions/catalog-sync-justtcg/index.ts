import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const JTCG = "https://api.justtcg.com/v1";
const JHDRS: HeadersInit = { "X-API-Key": Deno.env.get("JUSTTCG_API_KEY")! };
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/,"");

// Game mapping: external name -> internal slug
const GAME_MAP: Record<string, string> = {
  "magic-the-gathering": "mtg",
  "pokemon-japan": "pokemon_japan"
};

// --- helpers ---
async function backoffWait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500) {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 404) {
          // Clean 404 handling for pagination
          return { data: [], meta: { hasMore: false } };
        }
        if (res.status === 429 || res.status >= 500) {
          // Use rate-limit headers if available
          const retryAfter = res.headers.get('retry-after');
          const delayMs = retryAfter ? parseInt(retryAfter) * 1000 : baseDelayMs * (2 ** i);
          await backoffWait(delayMs);
          continue;
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      return await res.json();
    } catch (e) {
      last = e;
      await backoffWait(baseDelayMs * (2 ** i));
    }
  }
  throw last || new Error(`retry_exhausted ${url}`);
}

async function upsertSets(rows: any[]) {
  if (!rows.length) return;
  const { error } = await sb.rpc("catalog_v2_upsert_sets", { rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunk = 400;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await sb.rpc("catalog_v2_upsert_cards", { rows: rows.slice(i, i + chunk) as any });
    if (error) throw error;
  }
}

async function queueChildJob(game: string, setName: string) {
  const { error } = await sb.rpc("http_post_async", {
    url: `${FUNCTIONS_BASE}/catalog-sync-justtcg?game=${encodeURIComponent(game)}&set=${encodeURIComponent(setName)}`,
    headers: { "Content-Type": "application/json" } as any,
    body: {} as any
  });
  if (error) throw error;
}

async function findSetByName(game: string, setName: string): Promise<string | null> {
  const { data, error } = await sb
    .from('catalog_v2.sets')
    .select('id')
    .eq('game', game)
    .eq('name', setName)
    .maybeSingle();
  
  if (error) throw error;
  return data?.id || null;
}

// --- Orchestrator mode: sync all sets ---
async function orchestrateFullSync(externalGame: string) {
  const internalGame = GAME_MAP[externalGame];
  if (!internalGame) {
    throw new Error(`Unsupported game: ${externalGame}`);
  }

  // 1) Fetch all sets from JustTCG
  const setsResponse = await fetchJsonWithRetry(`${JTCG}/sets?game=${encodeURIComponent(externalGame)}`, JHDRS);
  const sets = setsResponse?.data || [];

  if (!sets.length) {
    return { mode: "orchestrate", game: internalGame, queued_sets: 0 };
  }

  // 2) Upsert sets into catalog_v2.sets
  const setRows = sets.map((s: any) => ({
    id: s.code || s.id || s.name,
    game: internalGame,
    name: s.name ?? null,
    series: s.series ?? null,
    printed_total: null,
    total: null,
    release_date: s.releaseDate ?? null,
    images: s.images ?? null,
    updated_at: new Date().toISOString(),
  }));

  await upsertSets(setRows);

  // 3) Queue child jobs for each set
  let queuedCount = 0;
  for (const set of sets) {
    const setName = set.name || set.code || set.id;
    if (setName) {
      await queueChildJob(externalGame, setName);
      queuedCount++;
    }
  }

  return { mode: "orchestrate", game: internalGame, queued_sets: queuedCount };
}

// --- Worker mode: sync cards for specific set ---
async function syncSetCards(externalGame: string, setName: string) {
  const internalGame = GAME_MAP[externalGame];
  if (!internalGame) {
    throw new Error(`Unsupported game: ${externalGame}`);
  }

  let offset = 0;
  const limit = 100;
  const allCards: any[] = [];

  // Page through all cards for this set
  while (true) {
    const url = `${JTCG}/cards?game=${encodeURIComponent(externalGame)}&set=${encodeURIComponent(setName)}&limit=${limit}&offset=${offset}`;
    const response = await fetchJsonWithRetry(url, JHDRS);
    
    const cards = response?.data || [];
    const hasMore = response?.meta?.hasMore ?? false;

    if (!cards.length) break;

    // Extract only essential fields, ignore variants
    for (const card of cards) {
      allCards.push({
        id: card.id || `${setName}-${card.number || card.name}`,
        game: internalGame,
        name: card.name ?? null,
        number: card.number ?? null,
        set_id: null, // Will be set below
        rarity: card.rarity ?? null,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? null,
        images: card.images ?? null,
        tcgplayer_product_id: card.tcgplayerId ?? null,
        tcgplayer_url: null,
        data: {
          ...card,
          set: card.set // Store original set data
        },
        updated_at: new Date().toISOString(),
      });
    }

    if (!hasMore) break;
    offset += limit;
  }

  if (!allCards.length) {
    return { mode: "worker", game: internalGame, setName, cards: 0 };
  }

  // Try to find set_id by name
  const setId = await findSetByName(internalGame, setName);
  
  // Update all cards with set_id if found
  if (setId) {
    allCards.forEach(card => {
      card.set_id = setId;
    });
  }

  await upsertCards(allCards);

  return { mode: "worker", game: internalGame, setName, cards: allCards.length, set_id: setId };
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const game = url.searchParams.get("game")?.trim();
    const setName = url.searchParams.get("set")?.trim();

    if (!game) {
      return new Response(JSON.stringify({ error: "Missing required parameter: game" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (!GAME_MAP[game]) {
      return new Response(JSON.stringify({ 
        error: `Unsupported game: ${game}. Supported: ${Object.keys(GAME_MAP).join(', ')}` 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let result;
    if (setName) {
      // Worker mode: sync specific set
      result = await syncSetCards(game, setName);
    } else {
      // Orchestrator mode: sync all sets
      result = await orchestrateFullSync(game);
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (e: any) {
    console.error("catalog-sync-justtcg error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Internal server error",
      stack: e?.stack 
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});