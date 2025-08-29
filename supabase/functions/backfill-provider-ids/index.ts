import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/http-retry.ts';
import { log } from '../_shared/log.ts';
import { normalizeGameSlug, toApiGame, normalizeName, safeSlug } from '../_shared/game.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BASE = 'https://api.justtcg.com/v1';

function getApiKey(): string {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY environment variable not set');
  }
  return apiKey;
}

// Core backfill logic for a single game
async function backfillProviderId(supabase: any, apiKey: string, game: string, force = false) {
  const gameSlug = normalizeGameSlug(game);
  const apiGame = toApiGame(gameSlug);
  
    log.info('backfill.start', { gameSlug, apiGame, force });
    
    try {
      // Query Supabase for sets missing provider_id or all sets if force=true
      const { data: dbSets, error: dbError } = await supabase
        .rpc('catalog_v2_get_sets_for_backfill', {
          game_in: gameSlug,
          force_in: force,
        });
      
      log.info('backfill.query_result', { gameSlug, force, candidatesCount: dbSets?.length || 0 });

    if (dbError) {
      throw new Error(`Failed to query database: ${dbError.message}`);
    }

    if (!dbSets || dbSets.length === 0) {
      log.info('backfill.no_missing', { gameSlug });
      return {
        gameSlug,
        dbMissingCount: 0,
        apiCount: 0,
        matched: 0,
        unmatched: 0,
        processed: 0,
        updated: 0
      };
    }

    log.info('backfill.found_missing', { gameSlug, count: dbSets.length });

    // Fetch all sets from JustTCG API
    const setsUrl = `${BASE}/sets?game=${encodeURIComponent(apiGame)}`;
    
    const response = await fetchWithRetry(setsUrl, {
      headers: { 'X-API-Key': apiKey }
    }, {
      retries: 4,
      baseMs: 600,
      timeoutMs: 15000
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`API request failed: ${response.status} ${response.statusText} - ${body}`);
    }

    const apiData = await response.json();
    const apiSets = apiData.data || [];
    
    log.info('backfill.api_fetched', {
      gameSlug,
      apiGame,
      url: setsUrl.replace(apiKey, '***'),
      status: response.status,
      count: apiSets.length
    });

    if (apiSets.length === 0) {
      log.warn('backfill.no_api_sets', { gameSlug, apiGame });
      return {
        gameSlug,
        dbMissingCount: dbSets.length,
        apiCount: 0,
        matched: 0,
        unmatched: dbSets.length,
        processed: dbSets.length,
        updated: 0
      };
    }

    // Create lookup maps for API sets
    const codeMap = new Map();
    const nameMap = new Map();
    const slugMap = new Map();

    apiSets.forEach((apiSet: any) => {
      // Map by code (exact match, case-insensitive)
      if (apiSet.code) {
        const codeKey = apiSet.code.toLowerCase().trim();
        if (codeKey && !codeMap.has(codeKey)) {
          codeMap.set(codeKey, apiSet);
        }
      }

      // Map by normalized name
      const nameKey = normalizeName(apiSet.name);
      if (nameKey && !nameMap.has(nameKey)) {
        nameMap.set(nameKey, apiSet);
      }

      // Map by slug (normalized name with dashes)
      const slugKey = nameKey.replace(/\s+/g, '-');
      if (slugKey && !slugMap.has(slugKey)) {
        slugMap.set(slugKey, apiSet);
      }
    });

    // Match database sets to API sets
    const updates = [];
    let matched = 0;

    for (const dbSet of dbSets) {
      let apiSet = null;

      // Try matching by code first (most reliable)
      if (!apiSet && dbSet.name) {
        // Extract potential code from set name (e.g., "SV5a: Crimson Haze" -> "SV5a")
        const codeMatch = dbSet.name.match(/^([A-Z]{1,3}\d+[a-z]?):/i);
        if (codeMatch) {
          const codeKey = codeMatch[1].toLowerCase().trim();
          apiSet = codeMap.get(codeKey);
        }
      }

      // Try exact name match
      if (!apiSet) {
        const nameKey = normalizeName(dbSet.name);
        apiSet = nameMap.get(nameKey);
      }

      // Try slug match
      if (!apiSet) {
        const slugKey = normalizeName(dbSet.name).replace(/\s+/g, '-');
        apiSet = slugMap.get(slugKey);
      }

      if (apiSet) {
        updates.push({
          provider: 'justtcg',
          set_id: dbSet.set_id,
          provider_id: apiSet.id,
          game: gameSlug,
          name: apiSet.name,
          code: apiSet.code || null,
          series: apiSet.series || null,
          printed_total: apiSet.printedTotal || null,
          total: apiSet.total || null,
          release_date: apiSet.releasedAt || null,
          images: apiSet.images || null,
          data: apiSet
        });
        matched++;
        log.info('backfill.matched', {
          gameSlug,
          dbName: dbSet.name,
          apiName: apiSet.name,
          providerId: apiSet.id
        });
      } else {
        log.warn('backfill.unmatched', {
          gameSlug,
          dbName: dbSet.name,
          setId: dbSet.set_id
        });
      }
    }

    // Batch update the matched sets, handling conflicts gracefully
    let updated = 0;
    let conflicts = 0;
    
    if (updates.length > 0) {
      const chunkSize = 50; // Smaller chunks for better error handling
      
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        
        try {
          const { error: upsertError } = await supabase.rpc('catalog_v2_upsert_sets', {
            rows: chunk
          });
          
          if (upsertError) {
            if (upsertError.message.includes('sets_provider_unique')) {
              // Handle conflicts individually
              log.info('backfill.handling_conflicts', { gameSlug, chunkSize: chunk.length });
              
              for (const update of chunk) {
                try {
                  const { error: individualError } = await supabase.rpc('catalog_v2_upsert_sets', {
                    rows: [update]
                  });
                  
                  if (individualError) {
                    if (individualError.message.includes('sets_provider_unique')) {
                      conflicts++;
                      log.info('backfill.conflict_skipped', { 
                        gameSlug, 
                        setId: update.set_id,
                        name: update.name, 
                        providerId: update.provider_id 
                      });
                    } else {
                      throw individualError;
                    }
                  } else {
                    updated++;
                  }
                } catch (error: any) {
                  conflicts++;
                  log.warn('backfill.individual_error', { 
                    gameSlug, 
                    setId: update.set_id, 
                    error: error.message 
                  });
                }
              }
            } else {
              throw upsertError;
            }
          } else {
            updated += chunk.length;
          }
        } catch (error: any) {
          log.error('backfill.chunk_error', { 
            gameSlug, 
            chunkSize: chunk.length, 
            error: error.message 
          });
          conflicts += chunk.length;
        }
        
        log.info('backfill.batch_processed', { 
          gameSlug, 
          batchNum: Math.floor(i / chunkSize) + 1,
          totalBatches: Math.ceil(updates.length / chunkSize),
          updated, 
          conflicts 
        });
      }
      
      log.info('backfill.update_complete', { 
        gameSlug, 
        attempted: updates.length, 
        updated, 
        conflicts 
      });
    }

    const unmatched = dbSets.length - matched;
    log.info('backfill.complete', {
      gameSlug,
      dbMissingCount: dbSets.length,
      apiCount: apiSets.length,
      matched,
      unmatched
    });

    return {
      gameSlug,
      dbMissingCount: dbSets.length,
      apiCount: apiSets.length,
      matched,
      unmatched,
      processed: dbSets.length,
      updated,
      conflicts
    };

  } catch (error: any) {
    log.error('backfill.error', { gameSlug, error: error.message });
    return {
      gameSlug,
      error: error.message,
      dbMissingCount: 0,
      apiCount: 0,
      matched: 0,
      unmatched: 0,
      processed: 0,
      updated: 0
    };
  }
}

// Main server handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPA_URL, SUPA_KEY);
    const apiKey = getApiKey();

    // Parse request to get games to process
    let gamesToProcess: string[] = [];
    let force = false;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const game = url.searchParams.get('game');
      const f = url.searchParams.get('force');
      if (game) {
        gamesToProcess = [game];
      }
      if (f && (f === 'true' || f === '1' || f === 'yes')) {
        force = true;
      }
    } else if (req.method === 'POST') {
      try {
        const body = await req.json();
        if (body.games && Array.isArray(body.games)) {
          gamesToProcess = body.games;
        } else if (body.game) {
          gamesToProcess = [body.game];
        }
        if (typeof body.force === 'boolean') {
          force = body.force;
        }
      } catch (error) {
        log.warn('backfill.parse_error', { error: (error as any).message });
      }
    }

    // Default to all supported games if none specified
    if (gamesToProcess.length === 0) {
      gamesToProcess = ['pokemon', 'pokemon-japan', 'magic-the-gathering'];
    }

    log.info('backfill.request', { games: gamesToProcess, force });

    // Process each game
    const results = [];
    let totalProcessed = 0;
    let totalUpdated = 0;

    for (const game of gamesToProcess) {
      try {
        const result = await backfillProviderId(supabase, apiKey, game, force);
        results.push(result);
        totalProcessed += result.processed;
        totalUpdated += result.updated;
        
        // Small delay between games to respect rate limits
        if (gamesToProcess.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error: any) {
        log.error('backfill.game_error', { game, error: error.message });
        const errorResult = {
          gameSlug: game,
          error: error.message,
          dbMissingCount: 0,
          apiCount: 0,
          matched: 0,
          unmatched: 0,
          processed: 0,
          updated: 0
        };
        results.push(errorResult);
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

    log.info('backfill.summary', {
      gamesProcessed: results.length,
      totalProcessed,
      totalUpdated
    });

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error: any) {
    log.error('backfill.fatal', { error: error.message });
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});