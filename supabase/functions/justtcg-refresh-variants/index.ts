// JustTCG Pricing Refresh - Nightly pricing updates for catalog_v2.variants
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import shared utilities
import { fetchWithRetry } from "../_shared/http.ts";
import { logStructured } from "../_shared/log.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const JUSTTCG_BASE = "https://api.justtcg.com/v2";
const PAGE_SIZE = 200;
const PREFLIGHT_CEILING = 470; // Maximum batches allowed per run
const RATE_LIMIT_MS = 125; // ~480 RPM safety window

// Sleep utility
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Normalize game slugs consistently
function normalizeGameSlug(game: string): string {
  const normalized = game.toLowerCase();
  if (normalized === 'pokemon-japan') return 'pokemon-japan';
  if (normalized === 'mtg' || normalized === 'magic-the-gathering') return 'mtg';
  return 'pokemon';
}

// Get API key from environment or system settings
async function getApiKey(supabase: any): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'JUSTTCG_API_KEY')
    .single();
    
  if (data?.key_value) return data.key_value;
  throw new Error("JUSTTCG_API_KEY not found");
}

// Count total cards for a game
async function countCardsForGame(supabase: any, game: string): Promise<number> {
  const normalizedGame = normalizeGameSlug(game);
  
  const { count, error } = await supabase
    .from('catalog_v2.cards')
    .select('*', { count: 'exact', head: true })
    .eq('game', normalizedGame);
    
  if (error) {
    logStructured('ERROR', `Failed to count cards for game ${normalizedGame}`, { error: error.message });
    throw new Error(`Card count failed: ${error.message}`);
  }
  
  return count || 0;
}

// Get cards with pagination
async function getCardsBatch(supabase: any, game: string, offset: number): Promise<string[]> {
  const normalizedGame = normalizeGameSlug(game);
  
  const { data, error } = await supabase
    .from('catalog_v2.cards')
    .select('card_id')
    .eq('game', normalizedGame)
    .range(offset, offset + PAGE_SIZE - 1);
    
  if (error) {
    logStructured('ERROR', `Failed to fetch cards batch`, { game: normalizedGame, offset, error: error.message });
    throw new Error(`Card fetch failed: ${error.message}`);
  }
  
  return (data || []).map((row: any) => row.card_id);
}

// Call JustTCG API with batch of card IDs
async function fetchJustTcgPricing(cardIds: string[], apiKey: string): Promise<any> {
  if (!cardIds.length) return { data: [] };
  
  const url = `${JUSTTCG_BASE}/cards/bulk`;
  const body = {
    ids: cardIds,
    include_variants: true,
    include_analytics: true,
    sort: '24h'
  };
  
  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'User-Agent': 'Supabase-Edge-Function'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`JustTCG API error: ${response.status} ${errorText}`);
  }
  
  return await response.json();
}

// Map API response to variant updates
function mapToVariantUpserts(apiResponse: any, game: string): any[] {
  const normalizedGame = normalizeGameSlug(game);
  const upserts: any[] = [];
  
  for (const card of apiResponse.data || []) {
    for (const variant of card.variants || []) {
      // Use existing variant_key logic: variant_id or SHA-256 of attributes
      const variantKey = variant.variant_id || createVariantKey(variant);
      
      upserts.push({
        provider: 'justtcg',
        game: normalizedGame,
        variant_key: variantKey,
        card_id: card.id,
        language: variant.language || null,
        printing: variant.printing || null,
        condition: variant.condition || null,
        sku: variant.sku || null,
        price: variant.price ? Math.round(variant.price * 100) : null, // Convert to cents
        market_price: variant.market_price ? Math.round(variant.market_price * 100) : null,
        low_price: variant.low_price ? Math.round(variant.low_price * 100) : null,
        high_price: variant.high_price ? Math.round(variant.high_price * 100) : null,
        currency: variant.currency || 'USD',
        updated_from_source_at: new Date().toISOString()
      });
    }
  }
  
  return upserts;
}

// Create variant key from attributes (simplified SHA-256)
function createVariantKey(variant: any): string {
  const attrs = [
    variant.card_id || '',
    variant.language || '',
    variant.printing || '',
    variant.condition || ''
  ].join('|');
  
  // Simple hash for variant key (in production, use proper SHA-256)
  return `variant_${btoa(attrs).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16)}`;
}

// Upsert variants with latest pricing
async function upsertVariantsLatest(supabase: any, upserts: any[]): Promise<number> {
  if (!upserts.length) return 0;
  
  let updated = 0;
  
  // Process in chunks to avoid timeout
  const chunkSize = 50;
  for (let i = 0; i < upserts.length; i += chunkSize) {
    const chunk = upserts.slice(i, i + chunkSize);
    
    const { error, count } = await supabase
      .from('catalog_v2.variants')
      .upsert(chunk, { 
        onConflict: 'provider,variant_key',
        count: 'exact'
      });
      
    if (error) {
      logStructured('ERROR', `Variant upsert failed`, { error: error.message, chunkSize: chunk.length });
    } else {
      updated += count || 0;
    }
  }
  
  return updated;
}

// Insert pricing history rows
async function insertVariantPriceHistory(supabase: any, upserts: any[]): Promise<void> {
  if (!upserts.length) return;
  
  const historyRows = upserts.map(u => ({
    provider: u.provider,
    game: u.game,
    variant_key: u.variant_key,
    price_cents: u.price,
    market_price_cents: u.market_price,
    low_price_cents: u.low_price,
    high_price_cents: u.high_price,
    currency: u.currency,
    scraped_at: new Date().toISOString()
  }));
  
  // Insert history in chunks
  const chunkSize = 100;
  for (let i = 0; i < historyRows.length; i += chunkSize) {
    const chunk = historyRows.slice(i, i + chunkSize);
    
    const { error } = await supabase
      .from('catalog_v2.variant_price_history')
      .insert(chunk);
      
    if (error) {
      logStructured('ERROR', `Price history insert failed`, { error: error.message, chunkSize: chunk.length });
    }
  }
}

// Log job run summary
async function logJobRun(supabase: any, summary: any): Promise<void> {
  const { error } = await supabase
    .from('pricing_job_runs')
    .insert({
      game: summary.game,
      expected_batches: summary.expectedBatches,
      actual_batches: summary.actualBatches,
      cards_processed: summary.cardsProcessed,
      variants_updated: summary.variantsUpdated,
      duration_ms: summary.duration_ms,
      started_at: summary.started_at,
      finished_at: summary.finished_at,
      payload: summary.payload || {}
    });
    
  if (error) {
    logStructured('ERROR', `Failed to log job run`, { error: error.message });
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const startTime = Date.now();
    const url = new URL(req.url);
    const game = url.searchParams.get('game') || 'pokemon';
    
    logStructured('INFO', 'Starting pricing refresh', { game });
    
    // Initialize Supabase client (service role for direct catalog_v2 access)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Get API key
    const apiKey = await getApiKey(supabase);
    
    // Preflight check: count total cards and compute expected batches
    const totalCards = await countCardsForGame(supabase, game);
    const expectedBatches = Math.ceil(totalCards / PAGE_SIZE);
    
    if (expectedBatches > PREFLIGHT_CEILING) {
      const result = {
        success: false,
        error: 'preflight_ceiling',
        expectedBatches,
        totalCards,
        ceiling: PREFLIGHT_CEILING
      };
      
      logStructured('WARN', 'Preflight ceiling exceeded', result);
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    
    // Process cards in batches
    let actualBatches = 0;
    let cardsProcessed = 0;
    let variantsUpdated = 0;
    
    for (let i = 0; i < expectedBatches; i++) {
      const offset = i * PAGE_SIZE;
      
      try {
        // Get batch of card IDs
        const cardIds = await getCardsBatch(supabase, game, offset);
        if (!cardIds.length) break;
        
        // Fetch pricing from JustTCG API with retry/backoff
        const apiResponse = await fetchJustTcgPricing(cardIds, apiKey);
        
        // Map to variant upserts
        const upserts = mapToVariantUpserts(apiResponse, game);
        
        // Update latest pricing in catalog_v2.variants
        const updated = await upsertVariantsLatest(supabase, upserts);
        
        // Append to price history
        await insertVariantPriceHistory(supabase, upserts);
        
        actualBatches++;
        cardsProcessed += cardIds.length;
        variantsUpdated += updated;
        
        logStructured('INFO', 'Batch processed', {
          game,
          batch: i + 1,
          cardsInBatch: cardIds.length,
          variantsInBatch: upserts.length,
          updated
        });
        
        // Rate limiting
        if (i < expectedBatches - 1) {
          await sleep(RATE_LIMIT_MS);
        }
        
      } catch (error) {
        logStructured('ERROR', 'Batch processing failed', {
          game,
          batch: i + 1,
          offset,
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Continue with next batch rather than failing entire job
        actualBatches++;
      }
    }
    
    const finishedAt = new Date().toISOString();
    const duration_ms = Date.now() - startTime;
    
    // Log summary
    const summary = {
      success: true,
      game: normalizeGameSlug(game),
      expectedBatches,
      actualBatches,
      cardsProcessed,
      variantsUpdated,
      duration_ms,
      started_at: new Date(startTime).toISOString(),
      finished_at: finishedAt,
      payload: { preflight_ceiling: PREFLIGHT_CEILING, page_size: PAGE_SIZE }
    };
    
    logStructured('INFO', 'Pricing refresh completed', summary);
    
    // Log to pricing_job_runs table
    await logJobRun(supabase, summary);
    
    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    logStructured('ERROR', 'Pricing refresh failed', { 
      error: errorMessage,
      game: new URL(req.url).searchParams.get('game') || 'unknown'
    });
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});