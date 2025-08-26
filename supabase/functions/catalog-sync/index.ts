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

// Structured logging helper
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  console.log(JSON.stringify(logEntry));
}

// Performance tracking helper
class PerformanceTracker {
  private startTime: number;
  private context: Record<string, any>;

  constructor(context: Record<string, any> = {}) {
    this.startTime = Date.now();
    this.context = context;
  }

  log(message: string, additionalContext: Record<string, any> = {}) {
    const durationMs = Date.now() - this.startTime;
    logStructured('INFO', message, {
      ...this.context,
      ...additionalContext,
      durationMs
    });
  }

  error(message: string, error: any, additionalContext: Record<string, any> = {}) {
    const durationMs = Date.now() - this.startTime;
    logStructured('ERROR', message, {
      ...this.context,
      ...additionalContext,
      durationMs,
      error: error?.message || error,
      stack: error?.stack
    });
  }
}

// Get API key from env or system_settings table
async function getApiKey(): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabaseClient.from('system_settings').select('key_value').eq('key_name', 'JUSTTCG_API_KEY').single();
  if (data?.key_value) return data.key_value;
  
  throw new Error("JUSTTCG_API_KEY not found in environment or system_settings");
}

// Health check endpoint
async function healthCheck(): Promise<{ ok: boolean; api?: string; reason?: string; details?: any }> {
  try {
    // Check if API key is available
    let apiKey: string;
    try {
      apiKey = await getApiKey();
      if (!apiKey || apiKey.length < 10) {
        return { ok: false, reason: "Invalid or missing JUSTTCG_API_KEY" };
      }
    } catch (error) {
      return { ok: false, reason: "JUSTTCG_API_KEY not configured", details: error.message };
    }

    // Make lightweight probe to JustTCG /games endpoint
    try {
      const response = await fetch(`${JUSTTCG_BASE}/games`, {
        headers: { "X-API-Key": apiKey },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        if (response.status === 401) {
          return { ok: false, reason: "Invalid JUSTTCG_API_KEY - authentication failed" };
        }
        if (response.status === 403) {
          return { ok: false, reason: "JUSTTCG_API_KEY - insufficient permissions" };
        }
        return { ok: false, reason: `JustTCG API error: ${response.status} ${response.statusText}` };
      }

      const data = await response.json();
      const gameCount = data?.data?.length || 0;
      
      logStructured('INFO', 'Health check successful', {
        operation: 'health_check',
        gameCount,
        responseTime: response.headers.get('x-response-time')
      });

      return { ok: true, api: 'up', details: { gameCount } };

    } catch (error) {
      return { ok: false, reason: `JustTCG API connection failed: ${error.message}` };
    }

  } catch (error: any) {
    return { ok: false, reason: `Health check failed: ${error.message}` };
  }
}

// Helper functions for retry logic and backoff
async function backoffWait(ms: number) { 
  return new Promise(r => setTimeout(r, ms)); 
}

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500, context: Record<string, any> = {}) {
  let lastError: any;
  for (let i = 0; i < tries; i++) {
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, { headers });
      const durationMs = Date.now() - attemptStart;
      
      if (!res.ok) {
        logStructured('WARN', `HTTP error on attempt ${i + 1}`, {
          ...context,
          url,
          status: res.status,
          statusText: res.statusText,
          attempt: i + 1,
          durationMs
        });
        
        if (res.status === 429 || res.status >= 500) { 
          await backoffWait(baseDelayMs * 2**i); 
          continue; 
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      
      logStructured('INFO', 'Successful API request', {
        ...context,
        url,
        status: res.status,
        attempt: i + 1,
        durationMs
      });
      
      return await res.json();
    } catch (e) {
      const durationMs = Date.now() - attemptStart;
      lastError = e;
      
      logStructured('ERROR', `Request failed on attempt ${i + 1}`, {
        ...context,
        url,
        attempt: i + 1,
        error: e?.message || e,
        durationMs
      });
      
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

async function upsertVariants(rows: any[]) {
  if (!rows.length) return;
  const chunk = 400;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_variants", { rows: rows.slice(i, i + chunk) as any });
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
  const tracker = new PerformanceTracker({
    operation: 'sync_set',
    game,
    setId,
    filterJapanese
  });

  try {
    const apiKey = await getApiKey();
    const headers = { "X-API-Key": apiKey };
    
    logStructured('INFO', 'Starting set sync', {
      operation: 'sync_set',
      game,
      setId,
      filterJapanese
    });
    
    // Normalize game parameter for JustTCG API
    const apiGame = game === 'mtg' ? 'magic-the-gathering' : game;
    
    let allCards: any[] = [];
    let limit = 100;
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    
    // Fetch all cards for this set
    while (hasMore) {
      pageCount++;
      const pageTracker = new PerformanceTracker({
        operation: 'sync_set_page',
        game,
        setId,
        page: pageCount,
        offset,
        limit
      });

      const url = `${JUSTTCG_BASE}/cards?game=${encodeURIComponent(apiGame)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
      
      const response = await fetchJsonWithRetry(url, headers, 6, 500, {
        operation: 'fetch_cards_page',
        game,
        setId,
        page: pageCount
      });
      
      const cards = response?.data || [];
      
      if (cards.length === 0) {
        hasMore = false;
        break;
      }
      
      allCards = allCards.concat(cards);
      hasMore = response?.meta?.hasMore || false;
      offset += limit;
      
      pageTracker.log('Completed page fetch', {
        cardsOnPage: cards.length,
        totalCards: allCards.length,
        hasMore
      });
    }
    
    if (!allCards.length) {
      tracker.log('Set sync completed - no cards found', {
        status: 'empty',
        pageCount
      });
      return { setId, cards: 0, sets: 0, variants: 0, variantsStored: 0 };
    }

    // Extract set info from first card and upsert
    const firstCard = allCards[0];
    if (firstCard?.set) {
      const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
      await upsertSets([{
        provider: 'justtcg',
        set_id: setId,
        game: gameSlug,
        name: firstCard.set.name ?? null,
        series: firstCard.set.series ?? null,
        printed_total: firstCard.set.printedTotal ?? null,
        total: firstCard.set.total ?? null,
        release_date: firstCard.set.releaseDate ?? null,
        images: firstCard.set.images ?? null,
        data: firstCard.set
      }]);
    }

    // Process cards and their variants
    const cardRows: any[] = [];
    const variantRows: any[] = [];
    let totalVariants = 0;
    
    for (const card of allCards) {
      // Filter variants for Japanese-only Pokémon if requested
      let variants = card.variants || [];
      if (filterJapanese && game === 'pokemon') {
        variants = variants.filter((variant: any) => variant.language === 'Japanese');
      }
      
      totalVariants += variants.length;
      
      const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
      
      // Add card to batch
      cardRows.push({
        provider: 'justtcg',
        card_id: card.id || `${setId}-${card.number}`,
        game: gameSlug,
        set_id: setId,
        name: card.name ?? null,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? null,
        images: card.images ?? null,
        tcgplayer_product_id: card.tcgplayerId ?? null,
        tcgplayer_url: card.tcgplayerUrl ?? null,
        data: card
      });
      
      // Add variants to batch
      for (const variant of variants) {
        variantRows.push({
          provider: 'justtcg',
          variant_id: variant.id ?? null,
          card_id: card.id || `${setId}-${card.number}`,
          game: gameSlug,
          language: variant.language ?? null,
          printing: variant.printing ?? null,
          condition: variant.condition ?? null,
          sku: variant.sku ?? null,
          price: variant.price ?? null,
          market_price: variant.marketPrice ?? null,
          low_price: variant.lowPrice ?? null,
          mid_price: variant.midPrice ?? null,
          high_price: variant.highPrice ?? null,
          currency: variant.currency ?? 'USD',
          data: variant
        });
      }
    }
    
    // Upsert in order: sets -> cards -> variants (due to foreign keys)
    await upsertCards(cardRows);
    if (variantRows.length > 0) {
      await upsertVariants(variantRows);
    }
    
    tracker.log('Set sync completed successfully', {
      status: 'success',
      pageCount,
      setsUpserted: firstCard?.set ? 1 : 0,
      cardsUpserted: cardRows.length,
      variantsUpserted: variantRows.length,
      totalVariants
    });
    
    return { 
      setId, 
      cards: cardRows.length, 
      sets: firstCard?.set ? 1 : 0, 
      variants: totalVariants,
      variantsStored: variantRows.length
    };
    
  } catch (error: any) {
    tracker.error('Set sync failed', error, {
      status: 'error',
      upstreamError: error?.message,
      upstreamCode: error?.status || error?.code
    });
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
    
    // Health check endpoint
    if (url.pathname.endsWith('/health')) {
      const health = await healthCheck();
      const status = health.ok ? 200 : 503;
      return new Response(JSON.stringify(health), { 
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Queue drain endpoint
    if (url.pathname.endsWith('/drain')) {
      const game = (url.searchParams.get("game") || "").trim().toLowerCase();
      
      if (!game) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Missing game parameter' }), 
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const drainTracker = new PerformanceTracker({
        operation: 'queue_drain',
        game
      });

      try {
        // Get next item from queue
        const { data: queueItem, error: queueError } = await supabaseClient
          .rpc('catalog_v2_get_next_queue_item', { game_in: game })
          .maybeSingle();

        if (queueError) {
          drainTracker.error('Queue query failed', queueError, {
            status: 'queue_error'
          });
          throw queueError;
        }

        if (!queueItem) {
          drainTracker.log('No queue items available', {
            status: 'idle'
          });
          return new Response(
            JSON.stringify({ 
              ok: true, 
              message: 'No items in queue',
              game,
              status: 'idle'
            }), 
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

        drainTracker.log('Processing queue item', { 
          setId: queueItem.set_id, 
          queueItemId: queueItem.id,
          status: 'processing'
        });

        // Process the single set
        try {
          const filterJapanese = url.searchParams.get("filterJapanese") === "true";
          const result = await syncSet(game, queueItem.set_id, filterJapanese);
          
          // Mark as done
          const { error: markDoneError } = await supabaseClient.rpc('catalog_v2_mark_queue_item_done', { 
            item_id: queueItem.id 
          });

          if (markDoneError) {
            drainTracker.error('Failed to mark queue item as done', markDoneError);
            throw markDoneError;
          }

          drainTracker.log('Queue item completed successfully', { 
            setId: queueItem.set_id, 
            status: 'done',
            counts: result
          });

          return new Response(
            JSON.stringify({ 
              ok: true, 
              queueItemId: queueItem.id,
              game,
              setId: queueItem.set_id,
              status: 'done',
              counts: result
            }), 
            { 
              status: 200, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );

        } catch (syncError: any) {
          // Mark as error with retry logic
          const { error: markErrorError } = await supabaseClient.rpc('catalog_v2_mark_queue_item_error', { 
            item_id: queueItem.id, 
            error_message: syncError.message 
          });

          if (markErrorError) {
            drainTracker.error('Failed to mark queue item as error', markErrorError);
          }

          drainTracker.error('Queue item sync failed', syncError, { 
            setId: queueItem.set_id, 
            status: 'error',
            upstreamError: syncError.message
          });

          return new Response(
            JSON.stringify({ 
              ok: false, 
              queueItemId: queueItem.id,
              game,
              setId: queueItem.set_id,
              error: syncError.message,
              status: 'error'
            }), 
            { 
              status: 500, 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
            }
          );
        }

      } catch (error: any) {
        drainTracker.error('Queue drain operation failed', error, {
          status: 'error'
        });

        return new Response(
          JSON.stringify({ 
            ok: false, 
            error: error.message,
            game,
            status: 'error'
          }), 
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    const game = (url.searchParams.get("game") || "").trim().toLowerCase();
    const setId = (url.searchParams.get("setId") || "").trim();
    const since = (url.searchParams.get("since") || "").trim();
    const filterJapanese = url.searchParams.get("filterJapanese") === "true";

    const requestTracker = new PerformanceTracker({
      operation: 'catalog_sync_request',
      game,
      setId: setId || 'orchestration',
      since,
      filterJapanese
    });

    // Validate game parameter
    if (!["mtg", "pokemon"].includes(game)) {
      requestTracker.error('Invalid game parameter', new Error(`Invalid game: ${game}`), {
        status: 'validation_error'
      });
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
      requestTracker.log('Single set sync completed', {
        status: 'success',
        mode: 'single_set',
        ...result
      });
      return new Response(
        JSON.stringify({ mode: "bySetId", game, filterJapanese, ...result }), 
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Otherwise, orchestrate: fetch all sets and queue them
    const apiGame = game === 'mtg' ? 'magic-the-gathering' : game;
    
    logStructured('INFO', 'Starting orchestration sync', {
      operation: 'orchestration_start',
      game,
      apiGame,
      since,
      filterJapanese
    });
    
    // Fetch sets with pagination
    let allSets: any[] = [];
    let limit = 100;
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    
    while (hasMore) {
      pageCount++;
      const setsUrl = `${JUSTTCG_BASE}/sets?game=${encodeURIComponent(apiGame)}&limit=${limit}&offset=${offset}`;
      
      const setsResponse = await fetchJsonWithRetry(setsUrl, headers, 6, 500, {
        operation: 'fetch_sets_page',
        game,
        page: pageCount
      });
      
      const sets = setsResponse?.data || [];
      
      if (sets.length === 0) {
        hasMore = false;
        break;
      }
      
      allSets = allSets.concat(sets);
      hasMore = setsResponse?.meta?.hasMore || false;
      offset += limit;
      
      logStructured('INFO', 'Fetched sets page', {
        operation: 'fetch_sets_page',
        game,
        page: pageCount,
        setsOnPage: sets.length,
        totalSets: allSets.length,
        hasMore
      });
    }
    
    // Filter by date if since parameter provided
    const filteredSets = since 
      ? allSets.filter((s: any) => !s.releaseDate || s.releaseDate >= since)
      : allSets;
    
    logStructured('INFO', 'Sets filtered', {
      operation: 'sets_filter',
      game,
      totalSets: allSets.length,
      filteredSets: filteredSets.length,
      since
    });
    
    // Upsert all sets to database
    const gameSlug = game === 'mtg' ? 'mtg' : game === 'pokemon' ? 'pokemon' : game;
    const setRows = filteredSets.map((s: any) => ({
      provider: 'justtcg',
      set_id: s.code || s.id,
      game: gameSlug,
      name: s.name ?? null,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: s.images ?? null,
      data: s
    }));
    
    await upsertSets(setRows);
    
    // Queue individual set syncs
    for (const set of filteredSets) {
      const setCode = set.code || set.id;
      await queueSelfForSet(game + (filterJapanese ? '&filterJapanese=true' : ''), setCode);
    }

    requestTracker.log('Orchestration sync completed', {
      status: 'success',
      mode: since ? 'orchestrate_incremental' : 'orchestrate_full',
      setsQueued: filteredSets.length,
      totalSetsFound: allSets.length,
      pageCount
    });

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
    logStructured('ERROR', 'Catalog sync request failed', {
      operation: 'catalog_sync_request',
      error: e?.message || e,
      stack: e?.stack,
      upstreamCode: e?.status || e?.code
    });
    
    return new Response(
      JSON.stringify({ error: e?.message || "error" }), 
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
