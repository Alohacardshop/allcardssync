import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import shared utilities
import {
  CONFIG,
  rpmGate,
  fetchJsonWithRetry,
  logStructured
} from "../_lib/justtcg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

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
  
  // Fetch all cards with enhanced pagination using shared library
  while (hasMore) {
    pageCount++;
    const url = `${CONFIG.JUSTTCG_BASE}/cards?game=${encodeURIComponent(game)}&set=${encodeURIComponent(setId)}&limit=${CONFIG.PAGE_SIZE_GET}&offset=${offset}`;
    
    const response = await fetchJsonWithRetry(url, { headers });
    const cards = response.data || [];
    
    if (cards.length === 0) {
      hasMore = false;
      break;
    }
    
    allCards = allCards.concat(cards);
    hasMore = response._metadata?.hasMore || false;
    offset += CONFIG.PAGE_SIZE_GET;
    
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
      availableTokens: rpmGate.getAvailableTokens()
    });

    // Fetch all sets for the game using shared library
    const setsUrl = `${CONFIG.JUSTTCG_BASE}/sets?game=${encodeURIComponent(game)}`;
    const setsResponse = await fetchJsonWithRetry(setsUrl, { headers });
    const sets = setsResponse.data || [];

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
      availableTokens: rpmGate.getAvailableTokens()
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