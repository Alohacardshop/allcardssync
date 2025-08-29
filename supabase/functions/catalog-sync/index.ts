import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/http-retry.ts';
import { log } from '../_shared/log.ts';
import { normalizeGameSlug, toApiGame } from '../_shared/game.ts';

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

// Unified sync function with bulletproof error handling
export async function syncCatalogGeneric(params: { game: string; setIds?: string[]; since?: string }) {
  const supabase = createClient(SUPA_URL, SUPA_KEY);
  const gameSlug = normalizeGameSlug(params.game);
  const apiGame = toApiGame(gameSlug);
  const headers = { 'X-API-Key': Deno.env.get('JUSTTCG_API_KEY')! };

  log.info('catalog-sync.start', { gameSlug, apiGame });

  // 1) Fetch and upsert sets from JustTCG
  const setsUrl = `${BASE}/sets?game=${encodeURIComponent(apiGame)}`;
  const startTime = Date.now();
  
  const setsResp = await fetchWithRetry(setsUrl, { headers }, {
    retries: 4,
    baseMs: 600,
    timeoutMs: 15000
  });

  if (!setsResp.ok) {
    const body = await setsResp.text().catch(() => '');
    throw new Error(`HTTP ${setsResp.status} ${setsResp.statusText} for ${setsUrl}: ${body}`);
  }

  const setsData = await setsResp.json();
  const sets = (setsData?.data ?? []) as any[];
  const durationMs = Date.now() - startTime;
  
  log.info('catalog-sync.sets-fetched', {
    gameSlug,
    apiGame,
    url: setsUrl.replace(headers['X-API-Key'], '***'),
    status: setsResp.status,
    durationMs,
    count: sets.length
  });
  
  // Map sets with provider_id
  const setRows = sets.map(s => ({
    provider: 'justtcg',
    set_id: s.id, // Use API ID as our local set_id for new discoveries
    provider_id: s.id, // Store API identifier
    game: gameSlug, // Our internal slug
    name: s.name,
    code: s.code || null,
    series: s.series || null,
    printed_total: s.printedTotal || null,
    total: s.total || null,
    release_date: s.releasedAt || null,
    images: s.images || null,
    data: s
  }));
  
  await rpcChunk(supabase, 'catalog_v2_upsert_sets', setRows);
  log.info('catalog-sync.sets-upserted', { gameSlug, count: setRows.length });

  // Get target sets for card sync
  let targetSets = sets;
  if (params.setIds?.length) {
    // Query DB to get provider_id for the requested setIds
    const { data: dbSets } = await supabase
      .from('catalog_v2.sets')
      .select('set_id, provider_id, name')
      .eq('game', gameSlug)
      .in('set_id', params.setIds);
    
    if (dbSets?.length) {
      // Check for missing provider_id and abort if found
      const missingProviderIds = dbSets.filter(dbSet => !dbSet.provider_id);
      if (missingProviderIds.length > 0) {
        const missingSetIds = missingProviderIds.map(s => s.set_id);
        log.warn('sync.skip.noProvider', { 
          gameSlug, 
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
      
      // Use provider_id from DB for API calls
      targetSets = dbSets.map(dbSet => ({
        id: dbSet.provider_id, // API identifier for fetching
        name: dbSet.name,
        dbSetId: dbSet.set_id // Our local identifier for DB updates
      }));
    } else {
      // Fallback: filter API sets by setIds
      targetSets = sets.filter(s => params.setIds!.includes(s.id));
    }
  }

  // 2) Per-set card sync with bulletproof pagination
  let totalCards = 0;
  let totalVariants = 0;
  
  for (const s of targetSets) {
    const setProviderId = s.id; // API identifier for fetching
    const dbSetId = s.dbSetId || s.id; // Local identifier for DB updates
    
    log.info('catalog-sync.set-start', { 
      gameSlug,
      apiGame,
      dbSetId, 
      setProviderId
    });

    // Fetch ALL cards with pagination (includes sealed items)
    let offset = 0;
    const limit = 200;
    let setTotal = 0;
    const allCards: any[] = [];
    const reqId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    while (true) {
      const cardsUrl = `${BASE}/cards?game=${encodeURIComponent(apiGame)}&set=${encodeURIComponent(setProviderId)}&limit=${limit}&offset=${offset}`;
      
      log.info('cards-fetch', { 
        gameSlug, 
        apiGame,
        dbSetId, 
        setProviderId,
        url: cardsUrl.replace(headers['X-API-Key'], '***'),
        offset,
        limit,
        reqId 
      });
      
      const cardsResp = await fetchWithRetry(cardsUrl, { headers }, {
        retries: 4,
        baseMs: 600,
        timeoutMs: 15000
      });
      
      if (!cardsResp.ok) {
        const body = await cardsResp.text().catch(() => '');
        throw new Error(`Cards API ${cardsResp.status} ${cardsResp.statusText}: ${body}`);
      }
      
      const cardsData = await cardsResp.json();
      const cards = (cardsData?.data ?? []) as any[];
      const hasMore = cardsData?.meta?.hasMore === true;
      
      log.info('cards-response', { 
        gameSlug,
        dbSetId, 
        setProviderId, 
        offset, 
        count: cards.length,
        hasMore,
        reqId 
      });
      
      if (!cards.length) {
        if (setTotal === 0) {
          log.warn('cards.empty', { 
            gameSlug,
            apiGame,
            dbSetId, 
            setProviderId,
            url: cardsUrl.replace(headers['X-API-Key'], '***')
          });
        }
        break;
      }

      allCards.push(...cards);
      setTotal += cards.length;
      offset += limit;
      
      // Check if we have more data
      if (!hasMore || cards.length < limit) {
        break;
      }
    }

    if (allCards.length > 0) {
      // Map & upsert cards (includes sealed items)
      const cardRows = allCards.map(c => ({
        provider: 'justtcg',
        card_id: c.id,
        set_id: dbSetId, // Use our local set identifier
        game: gameSlug,
        name: c.name,
        number: c.number || null,
        rarity: c.rarity || null,
        supertype: c.supertype || null,
        subtypes: c.subtypes || null,
        images: c.images || null,
        tcgplayer_product_id: c.tcgplayerProductId || null,
        tcgplayer_url: c.tcgplayerUrl || null,
        data: c
      }));
      
      await rpcChunk(supabase, 'catalog_v2_upsert_cards', cardRows);

      // Flatten variants and upsert
      const variantRows = allCards.flatMap(c => 
        (c.variants ?? []).map((v: any) => ({
          provider: 'justtcg',
          variant_id: `${c.id}-${v.condition || 'Unknown'}-${v.printing || 'Normal'}`,
          card_id: c.id,
          game: gameSlug,
          language: v.language || null,
          printing: v.printing || null,
          condition: v.condition || null,
          sku: v.sku || null,
          price: v.price || null,
          market_price: v.marketPrice || null,
          low_price: v.lowPrice || null,
          mid_price: v.midPrice || null,
          high_price: v.highPrice || null,
          currency: v.currency || 'USD',
          data: v
        }))
      );
      
      if (variantRows.length) {
        await rpcChunk(supabase, 'catalog_v2_upsert_variants', variantRows);
      }

      totalVariants += variantRows.length;
    }
    
    totalCards += setTotal;
    log.info('catalog-sync.set-complete', { 
      gameSlug,
      dbSetId, 
      setProviderId,
      cardsProcessed: setTotal 
    });
    
    // Update last_seen_at using our local set_id
    await supabase
      .from('catalog_v2.sets')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('game', gameSlug)
      .eq('set_id', dbSetId);
  }

  log.info('catalog-sync.complete', { 
    gameSlug, 
    cardsProcessed: totalCards, 
    variantsProcessed: totalVariants 
  });

  return { 
    success: true,
    status: 'success',
    game: gameSlug, 
    cardsProcessed: totalCards, 
    variantsProcessed: totalVariants 
  };
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
            
            log.info('Set skipped due to cooldown', {
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
    log.error('catalog-sync failed', { error: error.message });
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