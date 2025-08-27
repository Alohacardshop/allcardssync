import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const JTCG = "https://api.justtcg.com/v1";
const JHDRS: HeadersInit = { "X-API-Key": Deno.env.get("JUSTTCG_API_KEY")! };
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/,"");

// Game mapping: external name -> internal slug
const GAME_MAP: Record<string, string> = {
  "magic-the-gathering": "mtg",
  "pokemon-japan": "pokemon-japan"
};

// API parameter mapping: for pokemon-japan, we need to use pokemon&region=japan
function getApiParams(externalGame: string) {
  if (externalGame === "pokemon-japan") {
    return "pokemon&region=japan";
  }
  return externalGame;
}

// --- helpers ---
async function backoffWait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Global throttling state
let lastRequestTime = 0;
let requestsThisMinute = 0;
let minuteStartTime = Date.now();
let rateLimitInfo: { 
  requestsPerMinute?: number; 
  requestsPerDay?: number; 
  plan?: string;
} = {};

async function adaptiveThrottle() {
  const now = Date.now();
  
  // Reset minute counter if a minute has passed
  if (now - minuteStartTime > 60000) {
    requestsThisMinute = 0;
    minuteStartTime = now;
  }
  
  // If we have rate limit info, respect it
  if (rateLimitInfo.requestsPerMinute && requestsThisMinute >= rateLimitInfo.requestsPerMinute * 0.8) {
    const waitTime = 60000 - (now - minuteStartTime);
    if (waitTime > 0) {
      console.log(`Throttling: waiting ${waitTime}ms for rate limit reset`);
      await backoffWait(waitTime);
      requestsThisMinute = 0;
      minuteStartTime = Date.now();
    }
  }
  
  // Minimum delay between requests (100ms for paid plans, 500ms for free)
  const minDelay = rateLimitInfo.plan === 'free' ? 500 : 100;
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < minDelay) {
    await backoffWait(minDelay - timeSinceLastRequest);
  }
  
  lastRequestTime = Date.now();
  requestsThisMinute++;
}

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500) {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try {
      await adaptiveThrottle();
      
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
          console.log(`Rate limited, waiting ${delayMs}ms`);
          await backoffWait(delayMs);
          continue;
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      
      const data = await res.json();
      
      // Extract rate limit info from _metadata for adaptive throttling
      if (data._metadata) {
        const meta = data._metadata;
        rateLimitInfo = {
          requestsPerMinute: meta.usage?.requestsPerMinute?.limit,
          requestsPerDay: meta.usage?.requestsPerDay?.limit,
          plan: meta.plan?.name
        };
        console.log(`Rate limit info: ${JSON.stringify(rateLimitInfo)}`);
      }
      
      return data;
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
    .rpc('catalog_v2_find_set_id_by_name', {
      game_in: game,
      name_in: setName
    });
  
  if (error) throw error;
  return data || null;
}

// --- Orchestrator mode: sync all sets ---
async function orchestrateFullSync(externalGame: string) {
  const internalGame = GAME_MAP[externalGame];
  if (!internalGame) {
    throw new Error(`Unsupported game: ${externalGame}`);
  }

  // 1) Fetch all sets from JustTCG (use correct API params for pokemon-japan)
  const apiParams = getApiParams(externalGame);
  const setsResponse = await fetchJsonWithRetry(`${JTCG}/sets?game=${apiParams}`, JHDRS);
  const sets = setsResponse?.data || [];

  if (!sets.length) {
    // Log error for empty sets response
    await sb.rpc('catalog_v2_log_error', {
      payload: {
        game: internalGame,
        set_id: null,
        step: 'orchestrate_sets',
        message: `No sets returned from JustTCG API for game: ${externalGame}`,
        detail: { api_params: apiParams, response: setsResponse }
      }
    });
    return { mode: "orchestrate", game: internalGame, queued_sets: 0 };
  }

  // 2) Upsert sets into catalog_v2.sets
  const setRows = sets.map((s: any) => ({
    set_id: s.code || s.id || s.name,
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

  // 3) Create import jobs for each set and queue child jobs
  let queuedCount = 0;
  for (const set of sets) {
    const setName = set.name || set.code || set.id;
    const setId = set.code || set.id || set.name;
    
    if (setName) {
      // Try to create import job entry with idempotency (will fail if duplicate exists due to unique index)
      try {
        await sb.schema('catalog_v2').from('import_jobs').insert({
          source: 'justtcg',
          game: internalGame,
          set_id: setId,
          set_code: set.code || null,
          status: 'queued'
        });

        await queueChildJob(externalGame, setName);
        queuedCount++;
      } catch (insertError: any) {
        // If insert fails due to duplicate, skip this set (already queued/running)
        if (insertError.code === '23505') { // unique_violation
          console.log(`Set ${setName} already has active job, skipping`);
        } else {
          throw insertError; // Re-throw other errors
        }
      }
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

  // Find import job for this set to update status
  const setId = await findSetByName(internalGame, setName);
  let jobId: string | null = null;
  
  // Try to find and update the import job
  try {
    const { data: job } = await sb.schema('catalog_v2').from('import_jobs')
      .select('id')
      .eq('game', internalGame)
      .eq('set_id', setId || setName)
      .eq('status', 'queued')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    jobId = job?.id || null;
    
    if (jobId) {
      // Update job to running status
      await sb.schema('catalog_v2').from('import_jobs')
        .update({ 
          status: 'running', 
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }
  } catch (e) {
    console.warn('Could not update job status:', e);
  }

  let offset = 0;
  const limit = 100; // Use larger page size for efficiency
  const allCards: any[] = [];

  console.log(`Starting sync for ${setName} (${externalGame} -> ${internalGame})`);

  try {
    // Page through all cards for this set (use correct API params for pokemon-japan)
    while (true) {
      // Check if job has been cancelled before heavy operations
      if (jobId) {
        const { data: currentJob } = await sb.schema('catalog_v2')
          .from('import_jobs')
          .select('status')
          .eq('id', jobId)
          .single();
        
        if (currentJob?.status === 'cancelled') {
          console.log(`Job ${jobId} was cancelled, aborting sync for ${setName}`);
          return { mode: "worker", game: internalGame, setName, cards: 0, cancelled: true };
        }
      }

      const apiParams = getApiParams(externalGame);
      const url = `${JTCG}/cards?game=${apiParams}&set=${encodeURIComponent(setName)}&limit=${limit}&offset=${offset}`;
      console.log(`Fetching page: offset=${offset}, limit=${limit}`);
      
      const response = await fetchJsonWithRetry(url, JHDRS);
      
      const cards = response?.data || [];
      const hasMore = response?.meta?.hasMore ?? false;

      console.log(`Received ${cards.length} cards, hasMore: ${hasMore}`);

      if (!cards.length) break;

      // Extract only minimal essential fields for lightweight storage
      for (const card of cards) {
        allCards.push({
          card_id: card.id || `${setName}-${card.number || card.name}`,
          game: internalGame,
          name: card.name ?? null,
          number: card.number ?? null,
          set_id: null, // Will be set below
          rarity: card.rarity ?? null,
          supertype: card.supertype ?? null,
          subtypes: Array.isArray(card.subtypes) ? card.subtypes : null,
          images: card.images ? { 
            small: card.images.small, 
            normal: card.images.normal 
          } : null, // Minimal image data
          tcgplayer_product_id: card.tcgplayerId ?? null, // Critical for price lookups
          tcgplayer_url: null,
          data: { 
            // Store only essential metadata, not full card data
            id: card.id,
            tcgplayerId: card.tcgplayerId,
            set: card.set
          },
          updated_at: new Date().toISOString(),
        });
      }

      if (!hasMore) break;
      offset += limit;
      
      // Brief pause between pages to be gentle on the API
      await backoffWait(50);
    }

    if (!allCards.length) {
      console.log(`No cards found for set: ${setName}`);
      
      // Update job to succeeded with 0 cards
      if (jobId) {
        await sb.schema('catalog_v2').from('import_jobs')
          .update({ 
            status: 'succeeded', 
            inserted: 0,
            total: 0,
            finished_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', jobId);
      }
      
      return { mode: "worker", game: internalGame, setName, cards: 0 };
    }

    // Update all cards with set_id if found
    if (setId) {
      allCards.forEach(card => {
        card.set_id = setId;
      });
    }

    // Final cancellation check before upsert
    if (jobId) {
      const { data: currentJob } = await sb.schema('catalog_v2')
        .from('import_jobs')
        .select('status')
        .eq('id', jobId)
        .single();
      
      if (currentJob?.status === 'cancelled') {
        console.log(`Job ${jobId} was cancelled before upsert, aborting sync for ${setName}`);
        return { mode: "worker", game: internalGame, setName, cards: 0, cancelled: true };
      }
    }

    console.log(`Upserting ${allCards.length} cards for set: ${setName}`);
    await upsertCards(allCards);

    // Update job to succeeded
    if (jobId) {
      await sb.schema('catalog_v2').from('import_jobs')
        .update({ 
          status: 'succeeded', 
          inserted: allCards.length,
          total: allCards.length,
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }

    return { mode: "worker", game: internalGame, setName, cards: allCards.length, set_id: setId };
    
  } catch (error: any) {
    console.error(`Error syncing set ${setName}:`, error);
    
    // Update job to failed
    if (jobId) {
      await sb.schema('catalog_v2').from('import_jobs')
        .update({ 
          status: 'failed', 
          error: error.message || 'Unknown error',
          finished_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', jobId);
    }
    
    throw error;
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e: any) {
    console.error("catalog-sync-justtcg error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Internal server error",
      stack: e?.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});