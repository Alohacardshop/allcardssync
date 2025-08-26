import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const JUSTTCG_BASE = "https://api.justtcg.com/v1";
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/, "");

// Get API key from env or system_settings table
async function getApiKey(): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabaseClient.from('system_settings').select('key_value').eq('key_name', 'JUSTTCG_API_KEY').single();
  if (data?.key_value) return data.key_value;
  
  throw new Error("JUSTTCG_API_KEY not found in environment or system_settings");
}

// Helper functions for retry logic and backoff
async function backoffWait(ms: number) { 
  return new Promise(r => setTimeout(r, ms)); 
}

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500) {
  let lastError: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) { 
          await backoffWait(baseDelayMs * 2**i); 
          continue; 
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      await backoffWait(baseDelayMs * 2**i);
    }
  }
  throw lastError || new Error(`retry_exhausted ${url}`);
}

async function postJsonWithRetry(url: string, body: any, headers: HeadersInit = {}, tries = 3, baseDelayMs = 500) {
  let lastError: any;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json', ...headers }, 
        body: JSON.stringify(body) 
      });
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) { 
          await backoffWait(baseDelayMs * 2**i); 
          continue; 
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      return await res.json();
    } catch (e) {
      lastError = e;
      await backoffWait(baseDelayMs * 2**i);
    }
  }
  throw lastError || new Error(`retry_exhausted ${url}`);
}

// Database operations
async function upsertSets(rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabaseClient.rpc("catalog_v2_upsert_sets", { rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunk = 400;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_cards", { rows: rows.slice(i, i + chunk) as any });
    if (error) throw error;
  }
}

async function queueSelfForSet(game: string, setId: string) {
  const { error } = await supabaseClient.rpc("http_post_async", {
    url: `${FUNCTIONS_BASE}/catalog-sync?game=${encodeURIComponent(game)}&setId=${encodeURIComponent(setId)}`,
    headers: { "Content-Type": "application/json" } as any,
    body: {} as any
  });
  if (error) throw error;
}

// Game-specific sync logic
async function syncSet(game: string, setId: string, filterJapanese = false) {
  const apiKey = await getApiKey();
  const headers = { "X-API-Key": apiKey };
  
  console.log(`Syncing set ${setId} for game ${game}, filterJapanese: ${filterJapanese}`);
  
  // Normalize game parameter for JustTCG API
  const apiGame = game === 'mtg' ? 'magic-the-gathering' : game;
  
  let allCards: any[] = [];
  let limit = 100;
  let offset = 0;
  let hasMore = true;
  
  // Fetch all cards for this set
  while (hasMore) {
    const url = `${JUSTTCG_BASE}/cards?game=${encodeURIComponent(apiGame)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
    console.log(`Fetching cards from: ${url}`);
    
    const response = await fetchJsonWithRetry(url, headers);
    const cards = response?.data || [];
    
    if (cards.length === 0) {
      hasMore = false;
      break;
    }
    
    allCards = allCards.concat(cards);
    hasMore = response?.meta?.hasMore || false;
    offset += limit;
    
    console.log(`Fetched ${cards.length} cards, total: ${allCards.length}, hasMore: ${hasMore}`);
  }
  
  if (!allCards.length) {
    return { setId, cards: 0, sets: 0, variants: 0 };
  }

  // Extract set info from first card and upsert
  const firstCard = allCards[0];
  if (firstCard?.set) {
    const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
    await upsertSets([{
      id: setId,
      game: gameSlug,
      name: firstCard.set.name ?? null,
      series: firstCard.set.series ?? null,
      printed_total: firstCard.set.printedTotal ?? null,
      total: firstCard.set.total ?? null,
      release_date: firstCard.set.releaseDate ?? null,
      images: firstCard.set.images ?? null,
      updated_at: new Date().toISOString()
    }]);
  }

  // Process cards and their variants
  const cardRows: any[] = [];
  let totalVariants = 0;
  
  for (const card of allCards) {
    // Filter variants for Japanese-only Pokémon if requested
    let variants = card.variants || [];
    if (filterJapanese && game === 'pokemon') {
      variants = variants.filter((variant: any) => variant.language === 'Japanese');
    }
    
    totalVariants += variants.length;
    
    const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
    cardRows.push({
      id: card.id || `${setId}-${card.number}`,
      game: gameSlug,
      name: card.name ?? null,
      number: card.number ?? null,
      set_id: setId,
      rarity: card.rarity ?? null,
      supertype: card.supertype ?? null,
      subtypes: card.subtypes ?? null,
      images: card.images ?? null,
      tcgplayer_product_id: card.tcgplayerId ?? null,
      tcgplayer_url: card.tcgplayerUrl ?? null,
      data: { ...card, variants }, // Store filtered variants in data
      updated_at: new Date().toISOString(),
    });
  }
  
  await upsertCards(cardRows);
  
  console.log(`Synced ${cardRows.length} cards with ${totalVariants} variants for set ${setId}`);
  
  return { 
    setId, 
    cards: cardRows.length, 
    sets: firstCard?.set ? 1 : 0, 
    variants: totalVariants 
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = (url.searchParams.get("game") || "").trim().toLowerCase();
    const setId = (url.searchParams.get("setId") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();
    const filterJapanese = url.searchParams.get("filterJapanese") === "true";

    // Validate game parameter
    if (!["mtg", "pokemon"].includes(game)) {
      return new Response(
        JSON.stringify({ error: "Invalid game. Must be 'mtg' or 'pokemon'" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await getApiKey();
    const headers = { "X-API-Key": apiKey };
    
    // If setId is provided, sync just that set
    if (setId) {
      const result = await syncSet(game, setId, filterJapanese);
      return new Response(
        JSON.stringify({ mode: "bySetId", game, filterJapanese, ...result }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Otherwise, orchestrate: fetch all sets and queue them
    const apiGame = game === 'mtg' ? 'magic-the-gathering' : game;
    console.log(`Orchestrating sync for game: ${game} (API: ${apiGame}), since: ${since}, filterJapanese: ${filterJapanese}`);
    
    // Fetch sets with pagination
    let allSets: any[] = [];
    let limit = 100;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const setsUrl = `${JUSTTCG_BASE}/sets?game=${encodeURIComponent(apiGame)}&limit=${limit}&offset=${offset}`;
      console.log(`Fetching sets from: ${setsUrl}`);
      
      const setsResponse = await fetchJsonWithRetry(setsUrl, headers);
      const sets = setsResponse?.data || [];
      
      if (sets.length === 0) {
        hasMore = false;
        break;
      }
      
      allSets = allSets.concat(sets);
      hasMore = setsResponse?.meta?.hasMore || false;
      offset += limit;
      
      console.log(`Fetched ${sets.length} sets, total: ${allSets.length}, hasMore: ${hasMore}`);
    }
    
    // Filter by date if since parameter provided
    const filteredSets = since 
      ? allSets.filter((s: any) => !s.releaseDate || s.releaseDate >= since)
      : allSets;
    
    console.log(`Found ${allSets.length} total sets, ${filteredSets.length} after date filter`);
    
    // Upsert all sets to database
    const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
    const setRows = filteredSets.map((s: any) => ({
      id: s.code || s.id,
      game: gameSlug,
      name: s.name ?? null,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      updated_at: new Date().toISOString(),
    }));
    
    await upsertSets(setRows);
    
    // Queue individual set syncs
    for (const set of filteredSets) {
      const setCode = set.code || set.id;
      await queueSelfForSet(game + (filterJapanese ? '&filterJapanese=true' : ''), setCode);
    }

    return new Response(
      JSON.stringify({ 
        mode: since ? "orchestrate_incremental" : "orchestrate_full", 
        game,
        filterJapanese,
        queued_sets: filteredSets.length,
        total_sets_found: allSets.length
      }), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (e: any) {
    console.error('Catalog sync error:', e);
    return new Response(
      JSON.stringify({ error: e?.message || "error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
