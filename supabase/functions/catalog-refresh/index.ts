import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Import shared utilities
import {
  CONFIG,
  getCardsPaged,
  postCardsByIds,
  sortVariants,
  sortCards,
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

// Validation schema
const RefreshSchema = z.object({
  // Either IDs or game/set params
  ids: z.array(z.string()).optional(),
  game: z.string().optional(),
  set: z.string().optional(),
  
  // Sorting options
  orderBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  
  // Analytics sorting (for ID mode)
  cardSortBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  cardSortOrder: z.enum(['asc', 'desc']).optional(),
  variantSortBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  variantSortOrder: z.enum(['asc', 'desc']).optional(),
}).refine(
  (data) => {
    // Either ids OR game must be provided
    return Boolean(data.ids?.length) !== Boolean(data.game);
  },
  {
    message: "Either 'ids' array or 'game' parameter must be provided (mutually exclusive)"
  }
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
async function upsertCards(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 400;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_cards", { rows: chunk as any });
    if (error) throw error;
  }
}

async function upsertVariants(rows: any[]) {
  if (!rows.length) return;
  const chunkSize = 1000;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabaseClient.rpc("catalog_v2_upsert_variants", { rows: chunk as any });
    if (error) throw error;
  }
}

// Sanitize data helpers
function sanitizeData(obj: any): any {
  if (!obj) return null;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return null;
  }
}

function sanitizeImages(images: any): any {
  if (!images) return null;
  if (typeof images === 'object' && !Array.isArray(images)) return images;
  if (typeof images === 'string') return { url: images };
  if (Array.isArray(images)) {
    return images.map(img => typeof img === 'string' ? { url: img } : img);
  }
  return null;
}

// Process and upsert cards
async function processCards(cards: any[]): Promise<{ cardsProcessed: number, variantsProcessed: number }> {
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
  
  // Upsert to database
  await upsertCards(cardRows);
  if (variantRows.length > 0) {
    await upsertVariants(variantRows);
  }
  
  return {
    cardsProcessed: cardRows.length,
    variantsProcessed: variantRows.length
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
    
    // Validate request
    const validation = RefreshSchema.safeParse(body);
    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request parameters',
          details: validation.error.format()
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const params = validation.data;
    const apiKey = await getApiKey();
    
    let result: { data: any[], _metadata: any };
    let mode: string;
    
    if (params.ids?.length) {
      // ID Mode: POST /cards with batches
      mode = 'ID Mode';
      logStructured('INFO', 'Starting ID refresh', { 
        idCount: params.ids.length,
        orderBy: params.orderBy || 'none'
      });
      
      result = await postCardsByIds(params.ids, apiKey, params.orderBy);
      
      // Apply server-side sorting if requested
      if (params.variantSortBy && params.variantSortOrder) {
        result.data.forEach(card => {
          if (card.variants) {
            card.variants = sortVariants(card.variants, params.variantSortBy!, params.variantSortOrder!);
          }
        });
      }
      
      if (params.cardSortBy && params.cardSortOrder) {
        result.data = sortCards(result.data, params.cardSortBy, params.cardSortOrder);
      }
      
    } else {
      // List Mode: GET /cards with optional set filter
      mode = 'List Mode';
      logStructured('INFO', 'Starting list refresh', { 
        game: params.game,
        set: params.set || 'all sets',
        orderBy: params.orderBy || 'none',
        order: params.order || 'asc'
      });
      
      result = await getCardsPaged({
        game: params.game!,
        set: params.set,
        orderBy: params.orderBy,
        order: params.order
      }, apiKey);
    }
    
    // Process and upsert cards
    const { cardsProcessed, variantsProcessed } = await processCards(result.data);
    
    logStructured('INFO', 'Refresh completed', {
      mode,
      cardsProcessed,
      variantsProcessed,
      apiMetadata: result._metadata
    });

    const response = {
      mode,
      cardsProcessed,
      variantsProcessed,
      _metadata: result._metadata || {},
      message: `Refresh completed successfully in ${mode}`
    };
    
    // Add mode-specific fields
    if (params.ids?.length) {
      (response as any).idsRequested = params.ids.length;
      (response as any).orderBy = params.orderBy || null;
      (response as any).cardSortBy = params.cardSortBy || null;
      (response as any).variantSortBy = params.variantSortBy || null;
    } else {
      (response as any).game = params.game;
      (response as any).set = params.set || null;
      (response as any).orderBy = params.orderBy || null;
      (response as any).order = params.order || 'asc';
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStructured('ERROR', 'Refresh failed', {
      error: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});