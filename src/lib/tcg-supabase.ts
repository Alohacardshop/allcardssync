import { createClient } from "@supabase/supabase-js";

// TCG Database Connection
const TCG_URL = "https://dhyvufggodqkcjbrjhxk.supabase.co";
const TCG_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXZ1Zmdnb2Rxa2NqYnJqaHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MDIyOTcsImV4cCI6MjA3MjA3ODI5N30.0GncadcSHVbthqyubXLiBflm44sFEz_izfF5uF-xEvs";

export const tcgSupabase = createClient(TCG_URL, TCG_ANON_KEY, {
  auth: {
    persistSession: false,
    storageKey: 'tcg-supabase'
  }
});

// TCG Database Types
export interface Game {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  description?: string;
}

export interface Set {
  id: string;
  name: string;
  code: string;
  game_id: string;
  release_date?: string;
  card_count?: number;
}

export interface Card {
  id: string;
  name: string;
  set_id: string;
  justtcg_card_id: string;
  rarity?: string;
  image_url?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
}

export interface Variant {
  id: string;
  card_id: string;
  condition: string;
  printing: string;
  price_cents: number;
  market_price_cents?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  number?: string;
  rarity?: string;
  image_url?: string;
  rank: number;
}

export interface PopularCard {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  image_url?: string;
  avg_price_cents: number;
  variant_count: number;
  rarity?: string; // Added optional rarity field
}

export interface PricingResponse {
  success: boolean
  cardId: string
  refreshed: boolean
  requestPayload?: any
  variants: Array<{
    id: string
    sku?: string
    condition: string
    printing: string
    pricing: {
      price_cents: number | null
      market_price_cents: number | null
      low_price_cents: number | null
      high_price_cents: number | null
    }
    // Legacy format for compatibility
    price_cents?: number
    market_price_cents?: number
    is_available: boolean
    last_updated: string
    card: {
      name: string
      image_url: string
      set_name: string
      game_name: string
    }
  }>
}

// Legacy interface for compatibility
export interface PricingData extends PricingResponse {}

export function formatPrice(cents: number | null): string {
  if (!cents) return 'N/A'
  return `$${(cents / 100).toFixed(2)}`
}

export function findVariant(response: PricingResponse, condition: string, printing: string) {
  return response.variants.find(v => 
    v.condition === condition && v.printing === printing
  )
}

export async function updateCardPricing(
  cardId: string, 
  condition: string = 'near_mint', 
  printing: string = 'normal'
): Promise<PricingResponse> {
  try {
    const { data, error } = await tcgSupabase.functions.invoke('get-card-pricing', {
      body: {
        cardId,
        condition,
        printing,
        refresh: true
      }
    })

    if (error) {
      // Handle 404 as "no pricing available"
      if (error.message?.includes('404') || error.message?.includes('No variants found')) {
        return {
          success: false,
          cardId,
          refreshed: true,
          variants: []
        }
      }
      throw error
    }
    return data
  } catch (error) {
    console.error('Pricing update failed:', error)
    // Fallback to cached data
    return getCachedPricing(cardId, condition, printing)
  }
}

// Helper to fetch JustTCG card ID from TCG DB
export async function getJustTCGCardId(cardId: string): Promise<string | null> {
  try {
    const { data, error } = await tcgSupabase
      .from('cards')
      .select('justtcg_card_id')
      .eq('id', cardId)
      .single();
    
    if (error || !data) {
      console.error('Failed to fetch JustTCG card ID:', error);
      return null;
    }
    
    return data.justtcg_card_id;
  } catch (error) {
    console.error('Error fetching JustTCG card ID:', error);
    return null;
  }
}

// Proxy pricing helper - calls our edge function instead of external API
export async function proxyPricing(
  justtcgCardId: string,
  condition?: string,
  printing?: string,
  refresh = false
): Promise<PricingResponse> {
  try {
    const response = await fetch('https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/tcg-card-search?action=pricing', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtcG9hbmRveWRhcXhoemRqbm1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0MDU5NDMsImV4cCI6MjA2OTk4MTk0M30.WoHlHO_Z4_ogeO5nt4I29j11aq09RMBtNug8a5rStgk'
      },
      body: JSON.stringify({
        cardId: justtcgCardId,
        condition,
        printing,
        refresh
      })
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          cardId: justtcgCardId,
          refreshed: refresh,
          variants: []
        };
      }
      
      const errorText = await response.text();
      throw new Error(`Pricing request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return {
      success: true,
      cardId: justtcgCardId,
      refreshed: refresh,
      variants: data.variants || [],
      requestPayload: { cardId: justtcgCardId, condition, printing, refresh }
    };
  } catch (error) {
    console.error('Proxy pricing error:', error);
    throw error;
  }
}

// Function to update variant pricing with optional variantId
export async function updateVariantPricing(
  cardId: string,
  condition?: string,
  printing?: string,
  variantId?: string
): Promise<PricingResponse> {
  try {
    // First get the JustTCG card ID
    const justtcgCardId = await getJustTCGCardId(cardId);
    if (!justtcgCardId) {
      throw new Error('Could not find JustTCG card ID for this card');
    }

    // Use our proxy for pricing
    return await proxyPricing(
      justtcgCardId,
      condition || 'near_mint',
      printing || 'normal', 
      true // refresh = true
    );
  } catch (error) {
    console.error('Error updating variant pricing:', error);
    throw error;
  }
}

export async function getCachedPricing(
  cardId: string, 
  condition?: string, 
  printing?: string
): Promise<PricingResponse> {
  const { data, error } = await tcgSupabase.functions.invoke('get-card-pricing', {
    body: {
      cardId,
      condition,
      printing,
      refresh: false
    }
  })

  if (error) {
    // Handle 404 as "no pricing available"
    if (error.message?.includes('404') || error.message?.includes('No variants found')) {
      return {
        success: false,
        cardId,
        refreshed: false,
        variants: []
      }
    }
    throw error
  }
  return data
}

// Get pricing by variant ID directly
export async function updateVariantPricingById(variantId: string): Promise<PricingResponse> {
  try {
    const { data, error } = await tcgSupabase.functions.invoke('get-card-pricing', {
      body: {
        variantId,
        refresh: true
      }
    })

    if (error) throw error
    return data
  } catch (error) {
    console.error('Variant pricing update failed:', error)
    throw error
  }
}

// Function to get current pricing without refresh with optional variantId
export async function getVariantPricing(
  cardId: string,
  condition?: string,
  printing?: string,
  variantId?: string
): Promise<PricingResponse> {
  try {
    // First get the JustTCG card ID
    const justtcgCardId = await getJustTCGCardId(cardId);
    if (!justtcgCardId) {
      throw new Error('Could not find JustTCG card ID for this card');
    }

    // Use our proxy for pricing
    return await proxyPricing(
      justtcgCardId,
      condition || 'near_mint',
      printing || 'normal',
      false // refresh = false (cached)
    );
  } catch (error) {
    console.error('Error getting variant pricing:', error);
    throw error;
  }
}

// Fetch card variants directly from TCG DB for condition/printing options
export async function fetchCardVariants(cardId: string): Promise<{conditions: string[], printings: string[]}> {
  try {
    const { data: variants, error } = await tcgSupabase
      .from('variants')
      .select('condition, printing')
      .eq('card_id', cardId);

    if (error) {
      console.error('Error fetching card variants:', error);
      return { conditions: [], printings: [] };
    }

    const conditions = [...new Set(variants?.map(v => v.condition).filter(Boolean))];
    const printings = [...new Set(variants?.map(v => v.printing).filter(Boolean))];

    return { conditions, printings };
  } catch (error) {
    console.error('Error fetching card variants:', error);
    return { conditions: [], printings: [] };
  }
}