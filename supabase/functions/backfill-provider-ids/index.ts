import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { normalizeGameSlug, toJustTCGParams, safeSlug } from '../_shared/slug.ts';
import { fetchWithRetry } from '../_shared/http.ts';
import { logStructured } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize name for matching
function normalizeName(s: string = ''): string {
  return s
    .normalize('NFKD')
    .replace(/Pok[eé]mon/gi, 'pokemon')
    .replace(/^[A-Z]{1,3}\d+[a-z]?:\s*/i, '') // strip leading set code like "SV5a: "
    .replace(/\(.*?\)|\[.*?\]/g, '') // drop () or [] suffixes
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

async function getApiKey(): Promise<string> {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not found in environment');
  }
  return apiKey;
}

async function backfillProviderId(supabase: any, apiKey: string, gameSlug: string): Promise<{ gameSlug: string; dbMissingCount: number; apiCount: number; matched: number; unmatched: number; processed: number; updated: number }> {
  const normalizedGame = normalizeGameSlug(gameSlug);
  const { game, region } = toJustTCGParams(normalizedGame);
  
  logStructured('INFO', 'backfill.start', { gameSlug: normalizedGame, gameParam: game, region });
  
  // Get sets without provider_id - use strict game matching
  const { data: setsToBackfill, error: queryError } = await supabase
    .schema('catalog_v2')
    .from('sets')
    .select('set_id, name, code, provider_id, release_date')
    .eq('game', normalizedGame)
    .is('provider_id', null);
  
  if (queryError) {
    throw new Error(`Failed to query sets: ${queryError.message}`);
  }
  
  const dbMissingCount = setsToBackfill?.length || 0;
  
  if (!dbMissingCount) {
    logStructured('INFO', 'backfill.done', { gameSlug: normalizedGame, matched: 0, unmatched: 0 });
    return { gameSlug: normalizedGame, dbMissingCount: 0, apiCount: 0, matched: 0, unmatched: 0, processed: 0, updated: 0 };
  }

  // Fetch sets from JustTCG API with retries
  const regionParam = region ? `&region=${encodeURIComponent(region)}` : '';
  const url = `https://api.justtcg.com/v1/sets?game=${encodeURIComponent(game)}${regionParam}`;
  
  const response = await fetchWithRetry(url, {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json'
    }
  }, { retries: 4, baseDelayMs: 600, jitter: true });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`JustTCG API ${response.status} ${response.statusText}: ${body}`);
  }

  const raw = await response.json();
  const apiSets = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
  const apiCount = apiSets.length;
  
  if (!apiCount) {
    logStructured('INFO', 'backfill.done', { gameSlug: normalizedGame, matched: 0, unmatched: dbMissingCount });
    return { gameSlug: normalizedGame, dbMissingCount, apiCount: 0, matched: 0, unmatched: dbMissingCount, processed: dbMissingCount, updated: 0 };
  }
  
  // Build API-side indexes for O(1) lookups
  const codeMap = new Map<string, any>();
  const nameMap = new Map<string, any>();
  const slugMap = new Map<string, any>();
  
  for (const apiSet of apiSets) {
    if (apiSet.code) {
      const codeKey = apiSet.code.trim().toLowerCase();
      if (codeKey && !codeMap.has(codeKey)) {
        codeMap.set(codeKey, apiSet);
      }
    }
    
    if (apiSet.name) {
      const nameKey = normalizeName(apiSet.name);
      if (nameKey && !nameMap.has(nameKey)) {
        nameMap.set(nameKey, apiSet);
      }
      
      const slugKey = safeSlug(apiSet.name);
      if (slugKey && !slugMap.has(slugKey)) {
        slugMap.set(slugKey, apiSet);
      }
    }
  }
  
  // Match DB rows to API sets in priority order
  const updateRows = [];
  let matched = 0;
  
  for (const dbSet of setsToBackfill) {
    let apiMatch = null;
    
    // 1. Code match (highest priority)
    if (dbSet.set_id && dbSet.set_id.trim()) {
      const dbCodeKey = dbSet.set_id.trim().toLowerCase();
      apiMatch = codeMap.get(dbCodeKey);
    }
    
    // 2. Name match
    if (!apiMatch && dbSet.name) {
      const dbNameKey = normalizeName(dbSet.name);
      apiMatch = nameMap.get(dbNameKey);
    }
    
    // 3. Slug match
    if (!apiMatch && dbSet.name) {
      const dbSlugKey = safeSlug(dbSet.name);
      apiMatch = slugMap.get(dbSlugKey);
    }
    
    if (apiMatch) {
      updateRows.push({
        provider: 'justtcg',
        set_id: dbSet.set_id,
        provider_id: apiMatch.id,
        game: normalizedGame,
        name: apiMatch.name,
        series: apiMatch.series ?? null,
        printed_total: apiMatch.printedTotal ?? null,
        total: apiMatch.total ?? null,
        release_date: apiMatch.releasedAt || apiMatch.releaseDate || dbSet.release_date || null,
        images: apiMatch.images || null,
        data: apiMatch
      });
      matched++;
    }
  }
  
  // Perform chunked upserts
  if (updateRows.length > 0) {
    const chunkSize = 800;
    for (let i = 0; i < updateRows.length; i += chunkSize) {
      const chunk = updateRows.slice(i, i + chunkSize);
      const { error: upsertError } = await supabase.rpc('catalog_v2_upsert_sets', { rows: chunk });
      if (upsertError) {
        throw new Error(`Failed to upsert sets chunk: ${upsertError.message}`);
      }
    }
  }
  
  const unmatched = dbMissingCount - matched;
  logStructured('INFO', 'backfill.done', { gameSlug: normalizedGame, matched, unmatched });
  
  return { 
    gameSlug: normalizedGame, 
    dbMissingCount, 
    apiCount, 
    matched, 
    unmatched, 
    processed: dbMissingCount, 
    updated: matched 
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    
    const results = [];
    let totalProcessed = 0;
    let totalUpdated = 0;
    
    // Process each game sequentially to respect rate limits
    for (const gameSlug of gamesToProcess) {
      try {
        const result = await backfillProviderId(supabase, apiKey, gameSlug);
        results.push(result);
        totalProcessed += result.processed;
        totalUpdated += result.updated;
        
        // Small delay between games
        if (gamesToProcess.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        logStructured('ERROR', 'backfill.error', { gameSlug, error: error.message });
        results.push({ 
          gameSlug, 
          dbMissingCount: 0,
          apiCount: 0,
          matched: 0,
          unmatched: 0,
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

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    logStructured('ERROR', 'backfill.fatal', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});