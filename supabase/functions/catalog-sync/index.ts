import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/http.ts';
import { logStructured as log } from '../_shared/log.ts';
import { normalizeGameSlug, toJustTCGParams, mapSet, mapCard, mapVariant } from '../_shared/justtcg.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BASE = 'https://api.justtcg.com/v1';

async function rpcChunk<T>(sb: ReturnType<typeof createClient>, fn: string, rows: T[], size = 800) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await sb.rpc(fn, { rows: chunk });
    if (error) throw new Error(`${fn} failed: ${error.message}`);
  }
}

async function fetchJSON(url: string, headers: Record<string,string>) {
  const res = await fetchWithRetry(url, { headers }, { retries: 4, baseDelayMs: 600, jitter: true });
  if (!res.ok) {
    const body = await res.text().catch(()=>'');
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url} :: ${body}`);
  }
  return res.json();
}

export async function syncCatalogGeneric(params: { game: string; setIds?: string[]; since?: string }) {
  const supabase = createClient(SUPA_URL, SUPA_KEY);
  const inputGame = normalizeGameSlug(params.game);
  const { game, region } = toJustTCGParams(inputGame);
  const headers = { 'X-API-Key': Deno.env.get('JUSTTCG_API_KEY')! };
  const qRegion = region ? `&region=${encodeURIComponent(region)}` : '';

  log('INFO', 'catalog-sync:start', { gameSlug: inputGame, gameParam: game, region });

  // 1) Fetch sets from JustTCG
  const setsUrl = `${BASE}/sets?game=${encodeURIComponent(game)}${qRegion}`;
  const setsResp = await fetchJSON(setsUrl, headers);
  const sets = (setsResp?.data ?? []) as any[];
  
  // Map sets with provider_id
  const setRows = sets.map(s => ({
    ...mapSet(inputGame, s),
    provider_id: s.id // Store API identifier
  }));
  
  await rpcChunk(supabase, 'catalog_v2_upsert_sets', setRows);
  log('INFO', 'catalog-sync:upserted-sets', { count: setRows.length });

  // Get target sets - use DB lookup to get provider_id for specific setIds
  let targetSets = sets;
  if (params.setIds?.length) {
    // Query DB to get provider_id for the requested setIds
    const { data: dbSets } = await supabase
      .from('catalog_v2.sets')
      .select('set_id, provider_id, name')
      .eq('game', inputGame)
      .in('set_id', params.setIds);
    
    if (dbSets?.length) {
      // Check for missing provider_id and abort if found
      const missingProviderIds = dbSets.filter(dbSet => !dbSet.provider_id);
      if (missingProviderIds.length > 0) {
        const missingSetIds = missingProviderIds.map(s => s.set_id);
        log('WARN', 'sync.skip.noProvider', { 
          gameSlug: inputGame, 
          missingSetIds 
        });
        return {
          success: false,
          status: 'error',
          message: `Missing provider_id for sets: ${missingSetIds.join(', ')}. Run 'Backfill Provider IDs' first.`,
          sets: 0,
          cards: 0,
          variants: 0
        };
      }
      
      // Use provider_id from DB
      targetSets = dbSets.map(dbSet => ({
        id: dbSet.provider_id,
        name: dbSet.name,
        dbSetId: dbSet.set_id
      }));
    } else {
      // Fallback: filter API sets by setIds
      targetSets = sets.filter(s => params.setIds!.includes(s.id));
    }
  }

  // 2) Per-set fan-out for cards (idempotent via RPC upserts)
  let totalCards = 0;
  let totalVariants = 0;
  
  for (const s of targetSets) {
    const setIdent = s.id; // This is provider_id for fetching
    const dbSetId = s.dbSetId || s.id; // This is our local set_id for DB updates
    
    log('INFO', 'catalog-sync:set-start', { 
      setIdLocal: dbSetId, 
      setProviderId: setIdent,
      gameSlug: inputGame,
      gameParam: game, 
      region 
    });

    // Warn if using fallback
    if (!s.dbSetId && params.setIds?.length) {
      log('WARN', 'Using fallback set identifier', { 
        setIdLocal: dbSetId, 
        setProviderId: setIdent 
      });
    }

    // page through cards if needed
    let offset = 0; const limit = 200;
    let setTotal = 0;
    const reqId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    while (true) {
      const cardsUrl = `${BASE}/cards?game=${encodeURIComponent(game)}${qRegion}&set=${encodeURIComponent(setIdent)}&limit=${limit}&offset=${offset}`;
      
      log('INFO', 'cards-fetch', { 
        op: 'cards-fetch',
        gameSlug: inputGame, 
        gameParam: game, 
        region, 
        setIdLocal: dbSetId, 
        setProviderId: setIdent,
        url: cardsUrl,
        reqId 
      });
      
      const cardsResp = await fetchJSON(cardsUrl, headers);
      const cards = (cardsResp?.data ?? []) as any[];
      
      log('INFO', 'cards-response', { 
        setIdLocal: dbSetId, 
        setProviderId: setIdent, 
        offset, 
        count: cards.length,
        reqId 
      });
      
      if (!cards.length) {
        if (setTotal === 0) {
          log('WARN', 'No cards found for set', { 
            setIdLocal: dbSetId, 
            setProviderId: setIdent,
            gameSlug: inputGame,
            gameParam: game,
            region 
          });
        }
        break;
      }

      // Map & write cards
      const cardRows = cards.map(c => mapCard(inputGame, c));
      await rpcChunk(supabase, 'catalog_v2_upsert_cards', cardRows);

      // Flatten variants and write
      const variantRows = cards.flatMap(c => (c.variants ?? []).map((v: any) => mapVariant(inputGame, { ...v, cardId: c.id, setId: c.setId })));
      if (variantRows.length) {
        await rpcChunk(supabase, 'catalog_v2_upsert_variants', variantRows);
      }

      setTotal += cards.length;
      totalVariants += variantRows.length;
      log('INFO', 'catalog-sync:set-page', { setIdLocal: dbSetId, offset, count: cards.length, total: setTotal });
      offset += limit;
      if (cards.length < limit) break;
    }
    totalCards += setTotal;
    log('INFO', 'catalog-sync:set-complete', { setIdLocal: dbSetId, cardsProcessed: setTotal });
    
    // Update last_synced_at using our local set_id
    await supabase
      .from('catalog_v2.sets')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('game', inputGame)
      .eq('set_id', dbSetId);
  }

  log('INFO', 'catalog-sync:complete', { game: inputGame, cardsProcessed: totalCards, variantsProcessed: totalVariants });
  return { ok: true, game: inputGame, cardsProcessed: totalCards, variantsProcessed: totalVariants }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let setId, game, setIds, since, queueOnly, turbo, cooldownHours, forceSync;
    
    // Handle both GET (query params) and POST (JSON body) requests
    if (req.method === 'GET') {
      setId = url.searchParams.get("setId");
      game = url.searchParams.get("game") || "pokemon";
      since = url.searchParams.get("since") || "";
      queueOnly = url.searchParams.get("queueOnly") === "true";
      turbo = url.searchParams.get("turbo") === "true";
      cooldownHours = parseInt(url.searchParams.get("cooldownHours") || "12");
      forceSync = url.searchParams.get("forceSync") === "true";
    } else {
      // Handle POST request with JSON body
      const body = await req.json();
      setId = body.setId || url.searchParams.get("setId");
      setIds = body.setIds || [];
      game = body.game || url.searchParams.get("game") || "pokemon";
      since = body.since || url.searchParams.get("since") || "";
      queueOnly = body.queueOnly || url.searchParams.get("queueOnly") === "true";
      turbo = body.turbo || url.searchParams.get("turbo") === "true";
      cooldownHours = parseInt(body.cooldownHours || url.searchParams.get("cooldownHours") || "12");
      forceSync = body.forceSync || url.searchParams.get("forceSync") === "true";
    }

    // Normalize game slug for consistency
    game = normalizeGameSlug(game);
    const supabase = createClient(SUPA_URL, SUPA_KEY);

    // Prepare setIds array - either single setId or multiple setIds
    const targetSetIds = setIds?.length ? setIds : (setId ? [setId] : []);

    // Check cooldown if not forcing sync and we have specific sets
    if (!forceSync && cooldownHours > 0 && targetSetIds.length > 0 && !queueOnly) {
      const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
      
      for (const checkSetId of targetSetIds) {
        const { data: existingSet } = await supabase
          .from('catalog_v2.sets')
          .select('set_id, name, last_seen_at')
          .eq('game', game)
          .eq('set_id', checkSetId)
          .maybeSingle();

        if (existingSet) {
          const lastUpdate = existingSet.last_seen_at;
          if (lastUpdate && new Date(lastUpdate) > cooldownThreshold) {
            const message = `Set "${existingSet.name}" was last synced ${Math.round((Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60))} minutes ago. Skipping due to ${cooldownHours}h cooldown.`;
            
            log('INFO', 'Set skipped due to cooldown', {
              game, setId: checkSetId, status: 'skipped_cooldown'
            });

            return new Response(
              JSON.stringify({ 
                status: 'skipped_cooldown', 
                message,
                setId: checkSetId,
                setName: existingSet.name
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    }

    // Execute the sync
    const result = await syncCatalogGeneric({ 
      game, 
      setIds: targetSetIds.length ? targetSetIds : undefined, 
      since 
    });

    return new Response(
      JSON.stringify({ 
        status: 'success',
        ...result
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    log('ERROR', 'catalog-sync failed', { error: error.message });
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        message: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});