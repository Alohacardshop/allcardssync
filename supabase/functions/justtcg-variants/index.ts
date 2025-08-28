import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const JUSTTCG_BASE = "https://api.justtcg.com/v1";

// Normalize game slugs for JustTCG API
function normalizeGameSlug(game: string): string {
  switch (game) {
    case 'pokemon-japan':
      return 'pokemon_japan';
    case 'pokemon':
      return 'pokemon';
    case 'mtg':
    case 'magic-the-gathering':
      return 'magic-the-gathering';
    default:
      return game;
  }
}

async function getApiKey() {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data, error } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'JUSTTCG_API_KEY')
    .single();
    
  if (error || !data?.key_value) {
    throw new Error("JUSTTCG_API_KEY not found");
  }
  
  return data.key_value;
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, init);
      if (response.ok || response.status < 500) {
        return response;
      }
      if (i === retries - 1) return response;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
    }
  }
  throw new Error('Max retries reached');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = url.searchParams.get("game") || 'pokemon';
    const cardId = url.searchParams.get("cardId");
    const limit = parseInt(url.searchParams.get("limit") || '100');
    const offset = parseInt(url.searchParams.get("offset") || '0');

    if (!cardId) {
      return new Response(
        JSON.stringify({ error: "cardId parameter is required" }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Normalize game slug for JustTCG API
    const normalizedGame = normalizeGameSlug(game);
    
    console.log(`Fetching variants for game: ${game} (normalized to: ${normalizedGame}), cardId: ${cardId}`);

    const apiKey = await getApiKey();
    
    // Build API URL for card variants
    const apiUrl = new URL(`${JUSTTCG_BASE}/cards/${encodeURIComponent(cardId)}/variants`);
    apiUrl.searchParams.set('game', normalizedGame);
    apiUrl.searchParams.set('limit', limit.toString());
    apiUrl.searchParams.set('offset', offset.toString());
    
    const response = await fetchWithRetry(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('JustTCG API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `JustTCG API error: ${response.status}`,
          details: errorText
        }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const result = await response.json();
    
    return new Response(
      JSON.stringify({
        data: result.data || result,
        _metadata: result._metadata
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error: any) {
    console.error('Error fetching variants:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        details: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
})