import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeGameSlug, toJustTCGParams } from '../_shared/slug.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  capacity: number;
  refillRate: number;
}

// Rate limiter: 500 requests per minute
const rateLimiter: TokenBucket = {
  tokens: 500,
  lastRefill: Date.now(),
  capacity: 500,
  refillRate: 500 / 60, // tokens per second
};

function checkRateLimit(): boolean {
  const now = Date.now();
  const timePassed = (now - rateLimiter.lastRefill) / 1000;
  
  rateLimiter.tokens = Math.min(
    rateLimiter.capacity,
    rateLimiter.tokens + (timePassed * rateLimiter.refillRate)
  );
  rateLimiter.lastRefill = now;
  
  if (rateLimiter.tokens >= 1) {
    rateLimiter.tokens -= 1;
    return true;
  }
  return false;
}

async function getApiKey(): Promise<string> {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not found in environment');
  }
  return apiKey;
}

async function backfillProviderId(supabase: any, apiKey: string, gameId: string): Promise<{ game: string; processed: number; updated: number }> {
  const normalizedGame = normalizeGameSlug(gameId);
  const { game, region } = toJustTCGParams(normalizedGame);
  
  console.log(`Backfilling provider_ids for game: ${gameId} (normalized: ${normalizedGame}, api: ${game}${region ? `, region: ${region}` : ''})`);
  
  // Get sets without provider_id  
  console.log(`Querying catalog_v2.sets WHERE game='${normalizedGame}' AND provider_id IS NULL`);
  const { data: setsToBackfill, error: queryError } = await supabase
    .schema('catalog_v2')
    .from('sets')
    .select('set_id, name, release_date')
    .eq('game', normalizedGame)
    .is('provider_id', null);
  
  console.log(`Query result: found ${setsToBackfill?.length || 0} sets, error: ${queryError?.message || 'none'}`);
  
  if (queryError) {
    console.error('Database query error details:', queryError);
    throw new Error(`Failed to query sets: ${queryError.message}`);
  }
  
  if (!setsToBackfill?.length) {
    console.log(`No sets found without provider_id for ${gameId}`);
    return { game: gameId, processed: 0, updated: 0 };
  }
  
  // Rate limit check
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded');
  }

  // Fetch sets from JustTCG API
  const regionParam = region ? `&region=${encodeURIComponent(region)}` : '';
  const url = `https://api.justtcg.com/v1/sets?game=${encodeURIComponent(game)}${regionParam}`;
  
  console.log(`Fetching from JustTCG API: ${url}`);
  console.log(`Found ${setsToBackfill.length} sets without provider_id for ${gameId}`);
  
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`);
  }

  const raw = await response.json();
  const apiSets = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  
  console.log(`Retrieved ${apiSets.length} sets from API for ${gameId}`);
  
  if (!apiSets.length) {
    return { game: gameId, processed: setsToBackfill.length, updated: 0 };
  }
  
  // Match by name (case-insensitive, with normalization)
  let updated = 0;
  const updateRows = [];
  
  console.log(`Attempting to match ${setsToBackfill.length} DB sets with ${apiSets.length} API sets for ${gameId}`);
  
  for (const dbSet of setsToBackfill) {
    const match = apiSets.find((apiSet: any) => {
      if (!apiSet.name || !dbSet.name) return false;
      
      const apiName = apiSet.name.toLowerCase().trim();
      const dbName = dbSet.name.toLowerCase().trim();
      
      // Direct name match
      if (apiName === dbName) return true;
      
      // Normalized match (remove common prefixes/suffixes)
      const normalizeSetName = (name: string) => {
        return name
          .replace(/^(sv\d+[a-z]?:?\s*)/i, '') // Remove SV5a: prefix
          .replace(/\s*\(.*\)$/, '') // Remove trailing parentheses
          .replace(/\s+/g, ' ')
          .trim();
      };
      
      const normalizedApi = normalizeSetName(apiName);
      const normalizedDb = normalizeSetName(dbName);
      
      return normalizedApi === normalizedDb;
    });
    
    if (match) {
      console.log(`✅ Matched "${dbSet.name}" -> API set "${match.name}" (id: ${match.id})`);
    } else {
      console.log(`❌ No match found for "${dbSet.name}"`);
    }
    
    if (match) {
      updateRows.push({
        provider: 'justtcg',
        set_id: dbSet.set_id,
        provider_id: match.id,
        game: normalizedGame,
        name: dbSet.name,
        series: match.series,
        printed_total: match.printedTotal,
        total: match.total,
        release_date: match.releaseDate ? new Date(match.releaseDate).toISOString().split('T')[0] : dbSet.release_date,
        images: match.images || null,
        data: match,
        updated_from_source_at: new Date().toISOString()
      });
      updated++;
    }
  }
  
  if (updateRows.length > 0) {
    console.log(`Updating ${updateRows.length} sets with provider_id for ${gameId}`);
    
    const { error: upsertError } = await supabase.rpc('catalog_v2_upsert_sets', {
      rows: updateRows
    });
    
    if (upsertError) {
      throw new Error(`Failed to update sets: ${upsertError.message}`);
    }
  }
  
  console.log(`Backfill complete for ${gameId}: ${updated}/${setsToBackfill.length} sets updated`);
  return { game: gameId, processed: setsToBackfill.length, updated };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${new Date().toISOString()}] Backfill provider IDs request received`);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const apiKey = await getApiKey();
    
    // Parse request body or use default games
    let gamesToProcess: string[] = ['pokemon', 'pokemon-japan', 'magic-the-gathering'];
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.games && Array.isArray(body.games)) {
          gamesToProcess = body.games;
        }
      } catch (e) {
        // Use default games if JSON parsing fails
      }
    }
    
    console.log(`Processing games: ${gamesToProcess.join(', ')}`);
    
    const results = [];
    let totalProcessed = 0;
    let totalUpdated = 0;
    
    // Process each game sequentially to respect rate limits
    for (const gameId of gamesToProcess) {
      try {
        const result = await backfillProviderId(supabase, apiKey, gameId);
        results.push(result);
        totalProcessed += result.processed;
        totalUpdated += result.updated;
        
        console.log(`✅ ${gameId}: ${result.updated}/${result.processed} sets updated`);
        
        // Small delay between games
        if (gamesToProcess.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${gameId}:`, error.message);
        results.push({ 
          game: gameId, 
          processed: 0, 
          updated: 0, 
          error: error.message 
        });
      }
    }

    const responseData = {
      results,
      summary: {
        gamesProcessed: results.length,
        totalProcessed,
        totalUpdated,
        timestamp: new Date().toISOString()
      }
    };

    console.log(`Backfill completed: ${results.length} games, ${totalUpdated}/${totalProcessed} sets updated`);

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    console.error('Backfill provider IDs error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});