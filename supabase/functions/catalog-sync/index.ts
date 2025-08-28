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

const GAME_MAP = new Map<string, string>([
  ['mtg', 'magic-the-gathering'],
  ['magic-the-gathering', 'magic-the-gathering'],
  ['pokemon', 'pokemon'],
  ['pokemon-japan', 'pokemon'], // JustTCG uses pokemon + region=japan
]);

function normalizeGame(game: string): string {
  const key = game.trim().toLowerCase();
  return GAME_MAP.get(key) ?? key;
}

function getRegionParam(game: string): string {
  return game === 'pokemon-japan' ? 'japan' : '';
}

function buildApiUrl(baseUrl: string, game: string, additionalParams: Record<string, string> = {}): string {
  const apiGame = normalizeGame(game);
  const region = getRegionParam(game);
  
  const url = new URL(baseUrl);
  url.searchParams.set('game', apiGame);
  
  if (region) {
    url.searchParams.set('region', region);
  }
  
  for (const [key, value] of Object.entries(additionalParams)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  
  return url.toString();
}
const FUNCTIONS_BASE = (Deno.env.get("SUPABASE_FUNCTIONS_URL") ||
  Deno.env.get("SUPABASE_URL")!.replace(".supabase.co", ".functions.supabase.co")).replace(/\/+$/, "");

// JustTCG API v1 base URL
const JUSTTCG_BASE = "https://api.justtcg.com/v1";

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

// Helper function to sanitize image fields for database compatibility
function sanitizeImages(images: any): any {
  if (!images) return null;
  
  // If it's already a valid object, return as-is
  if (typeof images === 'object' && !Array.isArray(images)) {
    return images;
  }
  
  // If it's a string URL, wrap it in an object
  if (typeof images === 'string') {
    return { url: images };
  }
  
  // If it's an array of strings, convert to array of objects
  if (Array.isArray(images)) {
    return images.map(img => 
      typeof img === 'string' ? { url: img } : img
    );
  }
  
  // For any other invalid format, return null
  return null;
}

// Helper function to sanitize data objects for JSON storage
function sanitizeData(obj: any): any {
  if (!obj) return null;
  
  try {
    // Use JSON.parse(JSON.stringify()) to remove circular references, 
    // undefined values, and other non-serializable data
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    logStructured('WARN', 'Failed to sanitize data object', {
      operation: 'sanitize_data',
      error: error.message,
      dataType: typeof obj
    });
    return null;
  }
}

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500, context: Record<string, any> = {}) {
  let lastError: any;
  for (let i = 0; i < tries; i++) {
    const attemptStart = Date.now();
    try {
      // Add 15 second timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      
      const res = await fetch(url, { 
        headers,
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
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
      
      // Check if it's an abort/timeout error
      const isTimeout = e.name === 'AbortError' || e.message?.includes('timeout');
      
      logStructured('ERROR', `Request failed on attempt ${i + 1}${isTimeout ? ' (timeout)' : ''}`, {
        ...context,
        url,
        attempt: i + 1,
        error: e?.message || e,
        timeout: isTimeout,
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

// Database operations with configurable chunk sizes
async function upsertSets(rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabaseClient.rpc("catalog_v2_upsert_sets", { rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows: any[], turboMode = false) {
  if (!rows.length) return;
  const chunk = turboMode ? 350 : 120; // Larger chunks in turbo mode
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_cards", { rows: rows.slice(i, i + chunk) as any });
    if (error) throw error;
    // Reduced delay in turbo mode
    await backoffWait(turboMode ? 25 : 50);
  }
}

async function upsertVariants(rows: any[], turboMode = false) {
  if (!rows.length) return;
  const chunk = turboMode ? 350 : 120; // Larger chunks in turbo mode
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_variants", { rows: rows.slice(i, i + chunk) as any });
    if (error) throw error;
    await backoffWait(turboMode ? 25 : 50);
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

// Helper function to resolve set ID from JustTCG sets endpoint
async function resolveSetId(game: string, setName: string, headers: HeadersInit): Promise<string | null> {
  try {
    const setsUrl = buildApiUrl(`${JUSTTCG_BASE}/sets`, game, { limit: '1000' });
    
    logStructured('INFO', 'Attempting set ID resolution', {
      operation: 'resolve_set_id',
      game,
      setName,
      setsUrl
    });
    
    const response = await fetchJsonWithRetry(setsUrl, headers, 3, 1000, {
      operation: 'resolve_set_id',
      game,
      setName
    });
    
    const sets = response?.data || [];
    
    // Try exact name match first
    let matchedSet = sets.find((s: any) => s.name === setName);
    
    // If no exact match, try case-insensitive
    if (!matchedSet) {
      matchedSet = sets.find((s: any) => s.name?.toLowerCase() === setName.toLowerCase());
    }
    
    // If still no match, try partial match
    if (!matchedSet) {
      matchedSet = sets.find((s: any) => 
        s.name?.toLowerCase().includes(setName.toLowerCase()) ||
        setName.toLowerCase().includes(s.name?.toLowerCase())
      );
    }
    
    if (matchedSet) {
      const resolvedId = matchedSet.code || matchedSet.id;
      logStructured('INFO', 'Set ID resolved successfully', {
        operation: 'resolve_set_id',
        game,
        originalSetName: setName,
        matchedSetName: matchedSet.name,
        resolvedSetId: resolvedId,
        matchType: matchedSet.name === setName ? 'exact' : 
                  matchedSet.name?.toLowerCase() === setName.toLowerCase() ? 'case_insensitive' : 'partial'
      });
      return resolvedId;
    }
    
    logStructured('WARN', 'No matching set found for resolution', {
      operation: 'resolve_set_id',
      game,
      setName,
      availableSets: sets.slice(0, 5).map((s: any) => ({ name: s.name, code: s.code, id: s.id }))
    });
    
    return null;
  } catch (error: any) {
    logStructured('ERROR', 'Set ID resolution failed', {
      operation: 'resolve_set_id',
      game,
      setName,
      error: error.message
    });
    return null;
  }
}

// Game-specific sync logic with turbo mode support
async function syncSet(game: string, setId: string, turboMode = false) {
  const tracker = new PerformanceTracker({
    operation: 'sync_set',
    game,
    setId
  });

  try {
    const apiKey = await getApiKey();
    const headers = { "X-API-Key": apiKey };
    
    logStructured('INFO', 'Starting set sync', {
      operation: 'sync_set',
      game,
      setId,
      apiGame: normalizeGame(game),
      region: getRegionParam(game)
    });
    
    let allCards: any[] = [];
    let limit = turboMode ? 250 : 100; // Larger pages in turbo mode
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    
    // Fetch all cards for this set, with improved fallback logic
    let attemptedSlugFallback = false;
    let attemptedSetResolution = false;
    let currentSetId = setId;
    
    while (hasMore && pageCount < 100) { // Hard cap at 100 pages to prevent infinite loops
      pageCount++;
      const pageTracker = new PerformanceTracker({
        operation: 'sync_set_page',
        game,
        setId: currentSetId,
        page: pageCount,
        offset,
        limit
      });

      const url = buildApiUrl(`${JUSTTCG_BASE}/cards`, game, {
        set: currentSetId,
        limit: limit.toString(),
        offset: offset.toString()
      });
      
      logStructured('INFO', 'Fetching cards page', {
        operation: 'fetch_cards_page',
        game,
        setId: currentSetId,
        originalSetId: setId,
        page: pageCount,
        url,
        region: getRegionParam(game)
      });
      
      const response = await fetchJsonWithRetry(url, headers, 6, 500, {
        operation: 'fetch_cards_page',
        game,
        setId: currentSetId,
        page: pageCount
      });
      
      const cards = response?.data || [];
      
      // Enhanced fallback logic for first page with no cards
      if (cards.length === 0 && pageCount === 1) {
        // First try slug fallback
        if (!attemptedSlugFallback) {
          const slugifiedSetId = setId.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
          
          if (slugifiedSetId !== setId) {
            logStructured('INFO', 'No cards found with original setId, trying slug fallback', {
              operation: 'slug_fallback',
              originalSetId: setId,
              slugifiedSetId,
              game
            });
            
            attemptedSlugFallback = true;
            currentSetId = slugifiedSetId;
            pageCount = 0; // Reset page count for new attempt
            continue; // Retry with slugified setId
          }
        }
        
        // Then try set resolution from JustTCG sets endpoint
        if (!attemptedSetResolution) {
          const resolvedSetId = await resolveSetId(game, setId, headers);
          
          if (resolvedSetId && resolvedSetId !== currentSetId) {
            logStructured('INFO', 'Attempting set resolution fallback', {
              operation: 'set_resolution_fallback',
              originalSetId: setId,
              currentSetId,
              resolvedSetId,
              game
            });
            
            attemptedSetResolution = true;
            currentSetId = resolvedSetId;
            pageCount = 0; // Reset page count for new attempt
            continue; // Retry with resolved setId
          }
          
          attemptedSetResolution = true;
        }
        
        // Special check for pokemon-japan: detect wrong-region cards
        if (cards.length === 0 && pageCount === 1 && game === 'pokemon-japan') {
          // Try the same setId with regular pokemon API to see if this is an English-only set
          try {
            const englishUrl = buildApiUrl(`${JUSTTCG_BASE}/cards`, 'pokemon', {
              set: setId,
              limit: '1',
              offset: '0'
            });
            
            const englishResponse = await fetchJsonWithRetry(englishUrl, headers, 3, 500, {
              operation: 'wrong_region_check',
              game: 'pokemon',
              setId,
              page: 1
            });
            
            const englishCards = englishResponse?.data || [];
            if (englishCards.length > 0) {
              logStructured('ERROR', 'English-only set detected in pokemon-japan sync', {
                operation: 'wrong_region_error',
                originalGame: game,
                setId,
                message: 'This appears to be an English-only set. Use pokemon game mode instead of pokemon-japan.',
                englishCardsFound: englishCards.length
              });
              throw new Error(`Set "${setId}" appears to be English-only. Use pokemon game mode instead of pokemon-japan.`);
            }
          } catch (regionCheckError) {
            // If the region check itself fails, just continue with the original error
            if (regionCheckError.message?.includes('English-only')) {
              throw regionCheckError; // Re-throw if it's our custom error
            }
          }
        }
      }
      
      if (cards.length === 0) {
        hasMore = false;
        logStructured('INFO', `No more cards found, ending pagination ${attemptedSlugFallback ? '(after slug fallback)' : ''} ${attemptedSetResolution ? '(after set resolution)' : ''}`, {
          operation: 'pagination_end',
          game,
          setId: currentSetId,
          originalSetId: setId,
          totalCards: allCards.length,
          pageCount,
          attemptedSlugFallback,
          attemptedSetResolution
        });
        break;
      }
      
      // Check if we hit the page cap
      if (pageCount >= 100) {
        logStructured('WARN', 'Hit maximum page limit, stopping pagination', {
          operation: 'page_cap_reached',
          game,
          setId: currentSetId,
          totalCards: allCards.length,
          pageCount: 100
        });
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
      return { 
        setsProcessed: 0, 
        cardsProcessed: 0, 
        variantsProcessed: 0, 
        skipped: { sets: 0, cards: 0 },
        errors: []
      };
    }

    // Extract set info from first card and upsert
    const firstCard = allCards[0];
    if (firstCard?.set) {
      await upsertSets([{
        provider: 'justtcg',
        set_id: setId,
        game: game,
        name: firstCard.set.name ?? null,
        series: firstCard.set.series ?? null,
        printed_total: firstCard.set.printedTotal ?? null,
        total: firstCard.set.total ?? null,
        release_date: firstCard.set.releaseDate ?? null,
        images: sanitizeImages(firstCard.set.images),
        data: sanitizeData(firstCard.set)
      }]);
    }

    // Process cards and their variants
    const cardRows: any[] = [];
    const variantRows: any[] = [];
    let totalVariants = 0;
    let skippedCards = 0;
    let nonJapaneseVariants = 0;
    
    for (const card of allCards) {
      const variants = card.variants || [];
      totalVariants += variants.length;
      
      // Add card to batch
      cardRows.push({
        provider: 'justtcg',
        card_id: card.id || `${setId}-${card.number}`,
        game: game,
        set_id: setId,
        name: card.name ?? null,
        number: card.number ?? null,
        rarity: card.rarity ?? null,
        supertype: card.supertype ?? null,
        subtypes: card.subtypes ?? null,
        images: sanitizeImages(card.images),
        tcgplayer_product_id: card.tcgplayerId ?? null,
        tcgplayer_url: card.tcgplayerUrl ?? null,
        data: sanitizeData(card)
      });
      
      // Add variants to batch with defensive check for pokemon-japan
      for (const variant of variants) {
        // Defensive check: warn if pokemon-japan variant is not Japanese
        if (game === 'pokemon-japan' && variant.language && variant.language !== 'Japanese') {
          logStructured('WARN', 'Non-Japanese variant in pokemon-japan game', {
            operation: 'sync_set',
            game,
            setId,
            cardId: card.id,
            variantLanguage: variant.language,
            expectedLanguage: 'Japanese'
          });
          nonJapaneseVariants++;
        }
        
        variantRows.push({
          provider: 'justtcg',
          variant_id: variant.id ?? null,
          card_id: card.id || `${setId}-${card.number}`,
          game: game,
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
          data: sanitizeData(variant)
        });
      }
    }
    
    // Upsert in order: sets -> cards -> variants (due to foreign keys)
    await upsertCards(cardRows, turboMode);
    if (variantRows.length > 0) {
      await upsertVariants(variantRows, turboMode);
    }
    
    const warnings = nonJapaneseVariants > 0 ? [`${nonJapaneseVariants} non-Japanese variants found in pokemon-japan data`] : [];
    
    tracker.log('Set sync completed successfully', {
      status: 'success',
      pageCount,
      setsUpserted: firstCard?.set ? 1 : 0,
      cardsUpserted: cardRows.length,
      variantsUpserted: variantRows.length,
      totalVariants,
      skippedCards,
      nonJapaneseVariants,
      warnings
    });
    
    return { 
      setsProcessed: firstCard?.set ? 1 : 0,
      cardsProcessed: cardRows.length,
      variantsProcessed: variantRows.length,
      skipped: { sets: 0, cards: skippedCards },
      errors: [],
      warnings
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
      const mode = (url.searchParams.get("mode") || "").trim().toLowerCase();
      
      if (!mode || !["mtg", "pokemon", "pokemon-japan"].includes(mode)) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Missing or invalid mode parameter. Must be: mtg, pokemon, or pokemon-japan' }), 
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      const drainTracker = new PerformanceTracker({
        operation: 'queue_drain',
        mode
      });

      try {
        // Get next item from queue by mode
        const { data: queueItem, error: queueError } = await supabaseClient
          .rpc('catalog_v2_get_next_queue_item_by_mode', { mode_in: mode })
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
              mode,
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
          mode: queueItem.mode,
          game: queueItem.game,
          status: 'processing'
        });

        // Process the single set
        const turboMode = url.searchParams.get("turbo") === "true";
        try {
          const result = await syncSet(queueItem.game, queueItem.set_id, turboMode);
          
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
            mode: queueItem.mode,
            status: 'done',
            counts: result
          });

          return new Response(
            JSON.stringify({ 
              ok: true, 
              queueItemId: queueItem.id,
              mode: queueItem.mode,
              game: queueItem.game,
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
            mode: queueItem.mode,
            status: 'error',
            upstreamError: syncError.message
          });

          return new Response(
            JSON.stringify({ 
              ok: true, // Changed to true so UI continues processing queue
              queueItemId: queueItem.id,
              mode: queueItem.mode,
              game: queueItem.game,
              setId: queueItem.set_id,
              error: syncError.message,
              status: 'error',
              message: 'Item failed but marked as error, continuing queue'
            }), 
            { 
              status: 200, // Changed to 200 so UI doesn't stop
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
            mode,
            status: 'error'
          }), 
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Parse input from both JSON body and query parameters
    let inputParams: any = {};
    
    // Try to parse JSON body first
    try {
      const bodyText = await req.text();
      if (bodyText.trim()) {
        inputParams = JSON.parse(bodyText);
      }
    } catch (e) {
      // Fall back to query parameters if JSON parsing fails
    }
    
    // Merge with query parameters (query params take precedence)
    const game = (url.searchParams.get("game") || inputParams.game || "").toString().trim().toLowerCase();
    const setId = (url.searchParams.get("setId") || inputParams.setId || "").toString().trim();
    const since = (url.searchParams.get("since") || inputParams.since || "").toString().trim();
    const turboMode = url.searchParams.get("turbo") === "true" || inputParams.turbo === true;
    const cooldownHours = parseInt(url.searchParams.get("cooldownHours") || inputParams.cooldownHours || "12");
    const forceSyncParam = url.searchParams.get("forceSync") === "true" || inputParams.forceSync === true;
    const queueOnly = url.searchParams.get("queueOnly") === "true" || inputParams.queueOnly === true;

    const requestTracker = new PerformanceTracker({
      operation: 'catalog_sync_request',
      game,
      setId: setId || 'orchestration',
      since
    });

    // Validate game parameter
    if (!["mtg", "pokemon", "pokemon-japan"].includes(game)) {
      requestTracker.error('Invalid game parameter', new Error(`Invalid game: ${game}`), {
        status: 'validation_error'
      });
      return new Response(
        JSON.stringify({ error: "Invalid game. Must be 'mtg', 'pokemon', or 'pokemon-japan'" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate JUSTTCG_API_KEY exists and return 500 with clear message if missing
    let apiKey: string;
    try {
      apiKey = await getApiKey();
    } catch (error: any) {
      requestTracker.error('API key validation failed', error, {
        status: 'api_key_error'
      });
      return new Response(
        JSON.stringify({ error: "JUSTTCG_API_KEY not found in environment or system_settings" }), 
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const headers = { "X-API-Key": apiKey };
    
    // Determine mode for response (legacy support)
    const mode = game;
    
    // Log request parameters at function start for debugging
    logStructured('INFO', 'Catalog sync request started', {
      operation: 'catalog_sync_request',
      game,
      setId: setId || 'orchestration',
      since,
      queueOnly: url.searchParams.get("queueOnly") === "true",
      turbo: url.searchParams.get("turbo") === "true",
      cooldownHours: url.searchParams.get("cooldownHours") || "12",
      forceSync: url.searchParams.get("forceSync") === "true"
    });
    
    // If setId is provided, sync just that set
    if (setId) {
      
      // Check cooldown unless force sync is enabled
      if (!forceSyncParam && cooldownHours > 0) {
        const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
        
        const { data: existingSet, error: setCheckError } = await supabaseClient
          .schema('catalog_v2')
          .from('sets')
          .select('set_id, name, last_seen_at')
          .eq('game', game)
          .eq('set_id', setId)
          .maybeSingle();
          
        if (setCheckError) {
          requestTracker.error('Cooldown check failed', setCheckError);
        } else if (existingSet?.last_seen_at) {
          const lastSeen = new Date(existingSet.last_seen_at);
          if (lastSeen > cooldownThreshold) {
            const hoursAgo = Math.round((Date.now() - lastSeen.getTime()) / (1000 * 60 * 60));
            requestTracker.log('Set sync skipped due to cooldown', {
              status: 'skipped_cooldown',
              mode: 'single_set',
              setId,
              lastSeenAt: existingSet.last_seen_at,
              hoursAgo,
              cooldownHours
            });
            return new Response(
              JSON.stringify({ 
                mode,
                game,
                setId,
                status: 'skipped_cooldown',
                message: `Set "${existingSet.name}" was synced ${hoursAgo} hours ago (within ${cooldownHours}h cooldown). Use forceSync=true to override.`,
                lastSeenAt: existingSet.last_seen_at,
                setsProcessed: 0,
                cardsProcessed: 0,
                variantsProcessed: 0,
                skipped: { sets: 1, cards: 0 }
              }), 
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }
      
      // Handle queue-only mode - enqueue the job and return immediately
      if (queueOnly) {
        try {
          const { error: queueError } = await supabaseClient.rpc('catalog_v2_queue_set_by_mode', {
            mode_in: game,
            game_in: game,
            set_id_in: setId
          });

          if (queueError) {
            throw queueError;
          }

          requestTracker.log('Set queued successfully', {
            status: 'queued',
            mode: 'queue_only',
            setId
          });

          return new Response(
            JSON.stringify({ 
              mode,
              game,
              setId,
              status: 'queued',
              message: `Set "${setId}" has been queued for processing`,
              setsProcessed: 0,
              cardsProcessed: 0,
              variantsProcessed: 0,
              queued: true
            }), 
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (queueError: any) {
          requestTracker.error('Failed to queue set', queueError);
          return new Response(
            JSON.stringify({ 
              mode,
              game,
              setId,
              error: queueError.message,
              status: 'queue_error'
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      
      try {
        const result = await syncSet(game, setId, turboMode);
        requestTracker.log('Single set sync completed', {
          status: 'success',
          mode: 'single_set',
          ...result
        });
        return new Response(
          JSON.stringify({ 
            mode,
            game,
            ...result
          }), 
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (error: any) {
        requestTracker.error('Single set sync failed', error);
        return new Response(
          JSON.stringify({ 
            mode,
            game,
            setsProcessed: 0,
            cardsProcessed: 0,
            variantsProcessed: 0,
            skipped: { sets: 0, cards: 0 },
            errors: [{ scope: 'set', id: setId, reason: error.message }]
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Otherwise, orchestrate: fetch all sets and queue them
    logStructured('INFO', 'Starting orchestration sync', {
      operation: 'orchestration_start',
      game,
      apiGame: normalizeGame(game),
      region: getRegionParam(game),
      since
    });
    
    // Fetch sets with pagination
    let allSets: any[] = [];
    let limit = turboMode ? 250 : 100; // Larger pages in turbo mode
    let offset = 0;
    let hasMore = true;
    let pageCount = 0;
    
    while (hasMore) {
      pageCount++;
      const setsUrl = buildApiUrl(`${JUSTTCG_BASE}/sets`, game, {
        limit: limit.toString(),
        offset: offset.toString()
      });
      
      logStructured('INFO', 'Fetching sets page', {
        operation: 'fetch_sets_page',
        game,
        page: pageCount,
        url: setsUrl,
        region: getRegionParam(game)
      });
      
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
    const setRows = filteredSets.map((s: any) => ({
      provider: 'justtcg',
      set_id: s.code || s.id,
      game: game,
      name: s.name ?? null,
      series: s.series ?? null,
      printed_total: s.printedTotal ?? null,
      total: s.total ?? null,
      release_date: s.releaseDate ?? null,
      images: sanitizeImages(s.images),
      data: sanitizeData(s)
    }));
    
    await upsertSets(setRows);
    
    // Queue individual set syncs using mode-based queuing
    const { data: queuedCount, error: queueError } = await supabaseClient
      .rpc('catalog_v2_queue_pending_sets_by_mode', { 
        mode_in: game, 
        game_in: game, 
        filter_japanese: false
      });

    if (queueError) {
      throw queueError;
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
        mode,
        game,
        setsProcessed: filteredSets.length,
        cardsProcessed: 0, // Orchestration only queues sets, doesn't process cards directly
        variantsProcessed: 0, // Orchestration only queues sets, doesn't process variants directly
        skipped: { sets: allSets.length - filteredSets.length, cards: 0 },
        errors: []
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
