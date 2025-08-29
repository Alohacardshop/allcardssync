import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/http-retry.ts';
import { log } from '../_shared/log.ts';
import { normalizeGameSlug } from '../_shared/slug.ts';

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

// Normalize name for matching (G requirement)
function normalizeName(s = ''): string {
  return s.normalize('NFKD')
    .replace(/Pok[eé]mon/gi, 'pokemon')
    .replace(/^[A-Z]{1,3}\d+[a-z]?:\s*/i, '')   // strip "SV5a: "
    .replace(/\(.*?\)|\[.*?\]/g, '')            // remove (…) and […]
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();
}

// Convert game slug to API game parameter
function toApiGame(gameSlug: string): string {
  switch (gameSlug) {
    case 'pokemon-japan': return 'pokemon-japan';
    case 'pokemon': return 'pokemon';
    case 'magic-the-gathering': case 'mtg': return 'magic-the-gathering';
    default: return gameSlug;
  }
}

// SetIndex structure for canonical API data (A requirement)
interface SetIndex {
  ids: Set<string>;
  byCode: Map<string, any>;
  byName: Map<string, any>;
  byNorm: Map<string, any>;
}

function buildSetIndex(apiSets: any[]): SetIndex {
  const index: SetIndex = {
    ids: new Set(),
    byCode: new Map(),
    byName: new Map(), 
    byNorm: new Map()
  };

  for (const apiSet of apiSets) {
    // Track all API IDs
    index.ids.add(apiSet.id);

    // By code (lowercase)
    if (apiSet.code) {
      const codeKey = apiSet.code.toLowerCase();
      if (!index.byCode.has(codeKey)) {
        index.byCode.set(codeKey, apiSet);
      }
    }

    // By exact name
    if (apiSet.name && !index.byName.has(apiSet.name)) {
      index.byName.set(apiSet.name, apiSet);
    }

    // By normalized name
    const normKey = normalizeName(apiSet.name);
    if (normKey) {
      // Check for ambiguous matches
      if (index.byNorm.has(normKey)) {
        const existing = index.byNorm.get(normKey);
        if (existing.id !== apiSet.id) {
          // Mark as ambiguous by setting to null
          index.byNorm.set(normKey, null);
        }
      } else {
        index.byNorm.set(normKey, apiSet);
      }
    }
  }

  return index;
}

// Core backfill logic for a single game
async function backfillProviderId(supabase: any, apiKey: string, game: string, force = false, fixBadWrites = true) {
  const gameSlug = normalizeGameSlug(game);
  const apiGame = toApiGame(gameSlug);
  
  log.info('backfill.start', { gameSlug, apiGame, force });
  
  try {
    // A) Build canonical index from JustTCG API
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
      url: setsUrl,
      status: response.status,
      apiCount: apiSets.length
    });

    if (apiSets.length === 0) {
      log.warn('backfill.no_api_sets', { gameSlug, apiGame });
      return {
        gameSlug,
        dbMissingCount: 0,
        apiCount: 0,
        matched: 0,
        unmatched: 0,
        conflicts: 0,
        out_of_scope: 0,
        rolled_back: 0,
        processed: 0,
        updated: 0
      };
    }

    // Build SetIndex
    const setIndex = buildSetIndex(apiSets);
    
    // F) Rollback helper - fix bad writes from prior runs
    let rolled_back = 0;
    if (fixBadWrites) {
      const { data: withProviderIds, error: providerError } = await supabase
        .from('catalog_v2.sets')
        .select('set_id, provider_id')
        .eq('game', gameSlug)
        .not('provider_id', 'is', null);

      if (providerError) {
        log.warn('backfill.rollback_query_failed', { gameSlug, error: providerError.message });
      } else if (withProviderIds && withProviderIds.length > 0) {
        const badRows = withProviderIds.filter(row => !setIndex.ids.has(row.provider_id));
        if (badRows.length > 0) {
          for (const badRow of badRows) {
            const { error: nullifyError } = await supabase
              .from('catalog_v2.sets')
              .update({ provider_id: null })
              .eq('set_id', badRow.set_id)
              .eq('game', gameSlug);
            
            if (!nullifyError) {
              rolled_back++;
              log.info('backfill.rollback_bad_write', { 
                gameSlug, 
                setId: badRow.set_id, 
                badProviderId: badRow.provider_id 
              });
            }
          }
          log.info('backfill.rollback_bad_writes', { gameSlug, count: rolled_back });
        }
      }
    }

    // B) Restrict DB candidates - only pokemon-japan sets with NULL provider_id
    const { data: dbSets, error: dbError } = await supabase
      .from('catalog_v2.sets')
      .select('set_id, name, provider_id')
      .eq('game', gameSlug)
      .is('provider_id', null);
    
    if (dbError) {
      throw new Error(`Failed to query database: ${dbError.message}`);
    }

    const candidatesCount = dbSets?.length || 0;
    log.info('backfill.query_result', { gameSlug, candidatesCount });

    if (candidatesCount === 0) {
      return {
        gameSlug,
        dbMissingCount: 0,
        apiCount: apiSets.length,
        matched: 0,
        unmatched: 0,
        conflicts: 0,
        out_of_scope: 0,
        rolled_back,
        processed: 0,
        updated: 0
      };
    }

    // C) Exact-only matching order
    const updates = [];
    let matched = 0;
    let conflicts = 0;
    let out_of_scope = 0;
    let unmatched = 0;

    for (const dbSet of dbSets) {
      let apiSet = null;
      let matchType = '';

      // Extract potential code from DB set name
      let dbCode = null;
      const codeMatch = dbSet.name.match(/^([A-Z]{1,3}\d+[a-z]?):/i);
      if (codeMatch) {
        dbCode = codeMatch[1].toLowerCase();
      }

      // 1) Code exact match (if code present)
      if (!apiSet && dbCode) {
        apiSet = setIndex.byCode.get(dbCode);
        if (apiSet) matchType = 'codeExact';
      }

      // 2) Name exact match
      if (!apiSet) {
        apiSet = setIndex.byName.get(dbSet.name);
        if (apiSet) matchType = 'nameExact';
      }

      // 3) Normalized exact match
      if (!apiSet) {
        const normKey = normalizeName(dbSet.name);
        const candidate = setIndex.byNorm.get(normKey);
        if (candidate === null) {
          // Ambiguous match - multiple API sets have same normalized name
          log.warn('backfill.ambiguous', { gameSlug, dbName: dbSet.name });
          unmatched++;
          continue;
        } else if (candidate) {
          apiSet = candidate;
          matchType = 'normalizedExact';
        }
      }

      if (!apiSet) {
        // Check if this looks like a global/EN set that shouldn't be under pokemon-japan
        const dbNorm = normalizeName(dbSet.name);
        if (dbNorm && !dbNorm.includes('japan') && !dbNorm.includes('jp') && 
            !dbSet.name.match(/^[A-Z]{1,3}\d+[a-z]?:/i)) {
          log.warn('backfill.out_of_scope', { gameSlug, dbName: dbSet.name });
          out_of_scope++;
        } else {
          log.warn('backfill.unmatched', { gameSlug, dbName: dbSet.name });
          unmatched++;
        }
        continue;
      }

      // D) Safety checks before writing
      // Must write provider_id = api.id (not api.name)
      if (!apiSet.id) {
        log.warn('backfill.no_api_id', { gameSlug, dbName: dbSet.name, apiName: apiSet.name });
        unmatched++;
        continue;
      }

      // If matched by code, check that normalized names are compatible
      if (matchType === 'codeExact') {
        const dbNorm = normalizeName(dbSet.name);
        const apiNorm = normalizeName(apiSet.name);
        if (dbNorm !== apiNorm) {
          log.warn('backfill.conflict', { 
            gameSlug, 
            dbName: dbSet.name, 
            dbCode, 
            apiName: apiSet.name, 
            apiCode: apiSet.code 
          });
          conflicts++;
          continue;
        }
      }

      // Valid match - prepare for write
      updates.push({
        provider: 'justtcg',
        set_id: dbSet.set_id,
        provider_id: apiSet.id, // MUST be api.id, not api.name
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
        providerId: apiSet.id,
        matchType
      });
    }

    // E) Write path - batch in chunks
    let updated = 0;
    if (updates.length > 0) {
      const chunkSize = 50;
      
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        
        try {
          const { error: upsertError } = await supabase.rpc('catalog_v2_upsert_sets', {
            rows: chunk
          });
          
          if (!upsertError) {
            updated += chunk.length;
            log.info('backfill.write_chunk', { gameSlug, wrote: chunk.length });
          } else {
            throw upsertError;
          }
        } catch (error: any) {
          log.error('backfill.chunk_error', { 
            gameSlug, 
            chunkSize: chunk.length, 
            error: error.message 
          });
          throw error;
        }
      }
    }

    // H) Final logging
    log.info('backfill.done', {
      gameSlug,
      matched,
      unmatched,
      conflicts,
      out_of_scope,
      rolled_back
    });

    return {
      gameSlug,
      dbMissingCount: candidatesCount,
      apiCount: apiSets.length,
      matched,
      unmatched,
      conflicts,
      out_of_scope,
      rolled_back,
      processed: candidatesCount,
      updated
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
      conflicts: 0,
      out_of_scope: 0,
      rolled_back: 0,
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
    let fixBadWrites = true;
    
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const game = url.searchParams.get('game');
      const f = url.searchParams.get('force');
      const fix = url.searchParams.get('fixBadWrites');
      if (game) {
        gamesToProcess = [game];
      }
      if (f && (f === 'true' || f === '1' || f === 'yes')) {
        force = true;
      }
      if (fix && (fix === 'false' || fix === '0' || fix === 'no')) {
        fixBadWrites = false;
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
        if (typeof body.fixBadWrites === 'boolean') {
          fixBadWrites = body.fixBadWrites;
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
        const result = await backfillProviderId(supabase, apiKey, game, force, fixBadWrites);
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
          conflicts: 0,
          out_of_scope: 0,
          rolled_back: 0,
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