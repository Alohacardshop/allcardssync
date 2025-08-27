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

// Configuration constants
const CONFIG = {
  PAGE_SIZE: 200,
  MAX_BATCH_POST: 100,
  MAX_CONCURRENT: 24,
  RPM: 500,
  JUSTTCG_BASE: "https://api.justtcg.com/v1"
} as const;

// Global rate limiter using token bucket algorithm
class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.refillRate = refillPerMinute / (60 * 1000); // convert to per ms
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until we can get a token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.acquire();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Global rate limiter instance
const rateLimiter = new TokenBucket(CONFIG.RPM, CONFIG.RPM);

// Structured logging
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'catalog-sync-justtcg',
    ...context
  };
  console.log(JSON.stringify(logEntry));
}

// Get API key from environment or system settings
async function getApiKey(): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabaseClient
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'JUSTTCG_API_KEY')
    .single();
    
  if (data?.key_value) return data.key_value;
  throw new Error("JUSTTCG_API_KEY not found");
}

// Enhanced fetch with rate limiting, backoff, and jitter
async function fetchWithRateLimit(url: string, options: RequestInit = {}, retries = 5): Promise<Response> {
  // Wait for rate limit token
  await rateLimiter.acquire();
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        
        logStructured('WARN', 'Rate limited, waiting', {
          attempt: attempt + 1,
          retryAfter,
          delay: delay + jitter,
          url
        });
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      // Handle server errors with exponential backoff
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        
        logStructured('WARN', 'Server error, retrying', {
          attempt: attempt + 1,
          status: response.status,
          delay: delay + jitter,
          url
        });
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      return response;
      
    } catch (error) {
      lastError = error as Error;
      const delay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 1000;
      
      logStructured('ERROR', 'Network error, retrying', {
        attempt: attempt + 1,
        error: error.message,
        delay: delay + jitter,
        url
      });
      
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }
  
  throw lastError || new Error(`Failed after ${retries} attempts`);
}

// Fetch JSON with rate limiting
async function fetchJsonWithRateLimit(url: string, headers: HeadersInit = {}): Promise<any> {
  const response = await fetchWithRateLimit(url, { headers });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return await response.json();
}

// Database operations
async function upsertSets(rows: any[]) {
  if (!rows.length) return;
  const { error } = await supabaseClient.rpc("catalog_v2_upsert_sets", { rows: rows as any });
  if (error) throw error;
}

async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 200; // Larger chunks for better performance
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_cards", { rows: chunk as any });
    if (error) throw error;
  }
}

async function upsertVariants(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 200;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_variants", { rows: chunk as any });
    if (error) throw error;
  }
}

// Check if cards need updating based on lastUpdated timestamps
async function getCardsLastUpdated(cardIds: string[]): Promise<Map<string, string>> {
  if (!cardIds.length) return new Map();
  
  const { data, error } = await supabaseClient
    .from('catalog_v2.cards')
    .select('card_id, data')
    .in('card_id', cardIds);
    
  if (error) throw error;
  
  const lastUpdatedMap = new Map<string, string>();
  
  data?.forEach(row => {
    const lastUpdated = row.data?.lastUpdated;
    if (lastUpdated) {
      lastUpdatedMap.set(row.card_id, lastUpdated);
    }
  });
  
  return lastUpdatedMap;
}

// Sanitize data for JSON storage
function sanitizeData(obj: any): any {
  if (!obj) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

// Sanitize images for database compatibility
function sanitizeImages(images: any): any {
  if (!images) return null;
  if (typeof images === 'object' && !Array.isArray(images)) return images;
  if (typeof images === 'string') return { url: images };
  if (Array.isArray(images)) {
    return images.map(img => typeof img === 'string' ? { url: img } : img);
  }
  return null;
}

// Sync a single set with enhanced performance
async function syncSet(game: string, setId: string, apiKey: string): Promise<{
  setsProcessed: number;
  cardsProcessed: number;
  variantsProcessed: number;
  skipped: number;
}> {
  const headers = { "X-API-Key": apiKey };
  
  logStructured('INFO', 'Starting set sync', { game, setId });
  
  let allCards: any[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  
  // Fetch all cards with enhanced pagination
  while (hasMore) {
    pageCount++;
    const url = `${CONFIG.JUSTTCG_BASE}/cards?game=${encodeURIComponent(game)}&set=${encodeURIComponent(setId)}&limit=${CONFIG.PAGE_SIZE}&offset=${offset}`;
    
    const response = await fetchJsonWithRateLimit(url, headers);
    const cards = response?.data || [];
    
    if (cards.length === 0) {
      hasMore = false;
      break;
    }
    
    allCards = allCards.concat(cards);
    hasMore = response?.meta?.hasMore || false;
    offset += CONFIG.PAGE_SIZE;
    
    logStructured('INFO', 'Fetched page', {
      game,
      setId,
      page: pageCount,
      cardsOnPage: cards.length,
      totalCards: allCards.length,
      hasMore
    });
  }
  
  if (!allCards.length) {
    return { setsProcessed: 0, cardsProcessed: 0, variantsProcessed: 0, skipped: 0 };
  }
  
  // Check which cards need updating
  const cardIds = allCards.map(card => card.id || `${setId}-${card.number}`);
  const existingLastUpdated = await getCardsLastUpdated(cardIds);
  
  // Filter out cards that haven't changed
  const cardsToUpdate = allCards.filter(card => {
    const cardId = card.id || `${setId}-${card.number}`;
    const variants = card.variants || [];
    
    if (variants.length === 0) return true; // Always update cards without variants
    
    const existingUpdated = existingLastUpdated.get(cardId);
    if (!existingUpdated) return true; // New card
    
    // Check if any variant has a newer lastUpdated timestamp
    const newestVariantUpdate = Math.max(
      ...variants.map((v: any) => new Date(v.lastUpdated || 0).getTime())
    );
    
    const existingUpdatedTime = new Date(existingUpdated).getTime();
    return newestVariantUpdate > existingUpdatedTime;
  });
  
  const skippedCount = allCards.length - cardsToUpdate.length;
  
  if (skippedCount > 0) {
    logStructured('INFO', 'Skipping unchanged cards', {
      game,
      setId,
      total: allCards.length,
      skipped: skippedCount,
      toUpdate: cardsToUpdate.length
    });
  }
  
  if (cardsToUpdate.length === 0) {
    return { setsProcessed: 0, cardsProcessed: 0, variantsProcessed: 0, skipped: skippedCount };
  }
  
  // Extract and upsert set info
  const firstCard = cardsToUpdate[0];
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
  
  // Process cards and variants
  const cardRows: any[] = [];
  const variantRows: any[] = [];
  
  for (const card of cardsToUpdate) {
    const variants = card.variants || [];
    
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
    
    for (const variant of variants) {
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
  
  // Upsert in order
  await upsertCards(cardRows);
  if (variantRows.length > 0) {
    await upsertVariants(variantRows);
  }
  
  logStructured('INFO', 'Set sync completed', {
    game,
    setId,
    setsUpserted: firstCard?.set ? 1 : 0,
    cardsUpserted: cardRows.length,
    variantsUpserted: variantRows.length,
    skipped: skippedCount
  });
  
  return {
    setsProcessed: firstCard?.set ? 1 : 0,
    cardsProcessed: cardRows.length,
    variantsProcessed: variantRows.length,
    skipped: skippedCount
  };
}

// Concurrency pool for set processing
class ConcurrencyPool {
  private running = 0;
  private readonly maxConcurrency: number;
  private readonly queue: (() => Promise<void>)[] = [];

  constructor(maxConcurrency: number) {
    this.maxConcurrency = maxConcurrency;
  }

  async add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await task();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift()!;
    
    try {
      await task();
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = url.searchParams.get('game')?.toLowerCase();
    
    if (!game || !['magic-the-gathering', 'pokemon', 'pokemon-japan'].includes(game)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid game parameter. Must be: magic-the-gathering, pokemon, or pokemon-japan' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = await getApiKey();
    const headers = { "X-API-Key": apiKey };
    
    logStructured('INFO', 'Starting full game sync', { 
      game, 
      config: CONFIG,
      availableTokens: rateLimiter.getAvailableTokens()
    });

    // Fetch all sets for the game
    const setsUrl = `${CONFIG.JUSTTCG_BASE}/sets?game=${encodeURIComponent(game)}`;
    const setsResponse = await fetchJsonWithRateLimit(setsUrl, headers);
    const sets = setsResponse?.data || [];

    if (!sets.length) {
      return new Response(
        JSON.stringify({ 
          setsProcessed: 0, 
          cardsProcessed: 0, 
          variantsProcessed: 0,
          message: 'No sets found for game'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStructured('INFO', 'Found sets to process', { 
      game, 
      setCount: sets.length 
    });

    // Process sets with concurrency control
    const pool = new ConcurrencyPool(CONFIG.MAX_CONCURRENT);
    const results = await Promise.allSettled(
      sets.map((set: any) => 
        pool.add(() => syncSet(game, set.code || set.id, apiKey))
      )
    );

    // Aggregate results
    let totalSets = 0;
    let totalCards = 0;
    let totalVariants = 0;
    let totalSkipped = 0;
    let errors = 0;

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        totalSets += result.value.setsProcessed;
        totalCards += result.value.cardsProcessed;
        totalVariants += result.value.variantsProcessed;
        totalSkipped += result.value.skipped;
      } else {
        errors++;
        logStructured('ERROR', 'Set sync failed', {
          game,
          setId: sets[index]?.code || sets[index]?.id,
          error: result.reason?.message
        });
      }
    });

    logStructured('INFO', 'Full game sync completed', {
      game,
      totalSets,
      totalCards,
      totalVariants,
      totalSkipped,
      errors,
      availableTokens: rateLimiter.getAvailableTokens()
    });

    return new Response(
      JSON.stringify({
        setsProcessed: totalSets,
        cardsProcessed: totalCards,
        variantsProcessed: totalVariants,
        skipped: totalSkipped,
        errors,
        message: `Sync completed for ${game}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStructured('ERROR', 'Sync operation failed', {
      error: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});