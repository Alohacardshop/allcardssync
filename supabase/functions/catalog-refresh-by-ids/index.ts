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

const CONFIG = {
  MAX_BATCH_POST: 100,
  JUSTTCG_BASE: "https://api.justtcg.com/v1"
} as const;

// Structured logging
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'catalog-refresh-by-ids',
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

// Enhanced fetch with backoff and jitter
async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      return response;
      
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }
  
  throw lastError || new Error(`Failed after ${retries} attempts`);
}

// Database operations
async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 200;
  
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
    console.log(`Upserted ${chunk.length} variants (batch ${Math.floor(i/chunkSize) + 1})`);
  }
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

// Refresh cards by IDs using POST /cards endpoint
async function refreshCardsByIds(
  cardIds: string[], 
  apiKey: string, 
  orderBy?: string
): Promise<{
  cardsProcessed: number;
  variantsProcessed: number;
}> {
  const headers = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json"
  };
  
  let totalCards = 0;
  let totalVariants = 0;
  
  // Process IDs in batches
  for (let i = 0; i < cardIds.length; i += CONFIG.MAX_BATCH_POST) {
    const batch = cardIds.slice(i, i + CONFIG.MAX_BATCH_POST);
    
    logStructured('INFO', 'Processing batch', { 
      batchNumber: Math.floor(i / CONFIG.MAX_BATCH_POST) + 1,
      batchSize: batch.length,
      totalBatches: Math.ceil(cardIds.length / CONFIG.MAX_BATCH_POST)
    });
    
    // Prepare request body
    const requestBody: any = { ids: batch };
    if (orderBy) {
      requestBody.orderBy = orderBy;
    }
    
    const response = await fetchWithRetry(`${CONFIG.JUSTTCG_BASE}/cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    const cards = data?.data || [];
    
    if (!cards.length) {
      logStructured('WARN', 'No cards returned for batch', { batch });
      continue;
    }
    
    // Process cards and variants
    const cardRows: any[] = [];
    const variantRows: any[] = [];
    
    for (const card of cards) {
      const variants = card.variants || [];
      
      cardRows.push({
        provider: 'justtcg',
        card_id: card.id,
        game: card.game || 'unknown',
        set_id: card.setId || card.set?.code || card.set?.id,
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
          card_id: card.id,
          game: card.game || 'unknown',
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
    
    // Upsert batch
    await upsertCards(cardRows);
    if (variantRows.length > 0) {
      await upsertVariants(variantRows);
    }
    
    totalCards += cardRows.length;
    totalVariants += variantRows.length;
    
    logStructured('INFO', 'Batch processed', {
      batchCards: cardRows.length,
      batchVariants: variantRows.length,
      totalCards,
      totalVariants
    });
  }
  
  return {
    cardsProcessed: totalCards,
    variantsProcessed: totalVariants
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { ids, orderBy } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Invalid request. Provide an array of card IDs.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (ids.length > 1000) {
      return new Response(
        JSON.stringify({ error: 'Too many IDs. Maximum 1000 IDs per request.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate orderBy parameter
    const validOrderBy = ['price', '24h', '7d', '30d'];
    if (orderBy && !validOrderBy.includes(orderBy)) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid orderBy parameter. Must be one of: ${validOrderBy.join(', ')}` 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = await getApiKey();
    
    logStructured('INFO', 'Starting ID refresh', { 
      idCount: ids.length,
      orderBy: orderBy || 'none',
      batches: Math.ceil(ids.length / CONFIG.MAX_BATCH_POST)
    });

    const result = await refreshCardsByIds(ids, apiKey, orderBy);

    logStructured('INFO', 'ID refresh completed', {
      idsRequested: ids.length,
      cardsProcessed: result.cardsProcessed,
      variantsProcessed: result.variantsProcessed
    });

    return new Response(
      JSON.stringify({
        idsRequested: ids.length,
        cardsProcessed: result.cardsProcessed,
        variantsProcessed: result.variantsProcessed,
        orderBy: orderBy || null,
        message: 'ID refresh completed successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStructured('ERROR', 'ID refresh failed', {
      error: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});