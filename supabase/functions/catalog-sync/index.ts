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

  log('INFO', 'catalog-sync:start', { game: inputGame, mappedGame: game, region });

  // 1) Fetch sets from JustTCG
  const setsUrl = `${BASE}/sets?game=${encodeURIComponent(game)}${qRegion}`;
  const setsResp = await fetchJSON(setsUrl, headers);
  const sets = (setsResp?.data ?? []) as any[];
  const setRows = sets.map(s => mapSet(inputGame, s));
  await rpcChunk(supabase, 'catalog_v2_upsert_sets', setRows);
  log('INFO', 'catalog-sync:upserted-sets', { count: setRows.length });

  // If specific setIds provided, filter
  const targetSetIds = params.setIds?.length ? new Set(params.setIds) : null;
  const targetSets = targetSetIds ? sets.filter(s => targetSetIds.has(s.id)) : sets;

  // 2) Per-set fan-out for cards (idempotent via RPC upserts)
  let totalCards = 0;
  let totalVariants = 0;

  for (const s of targetSets) {
    const setId = s.id;
    log('INFO', 'catalog-sync:set-start', { setId });

    // page through cards if needed; assume JustTCG supports limit/offset
    let offset = 0; 
    const limit = 200;
    let setCards = 0;
    let setVariants = 0;
    
    while (true) {
      const cardsUrl = `${BASE}/cards?game=${encodeURIComponent(game)}${qRegion}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
      const cardsResp = await fetchJSON(cardsUrl, headers);
      const cards = (cardsResp?.data ?? []) as any[];
      if (!cards.length) break;

      // Map & write cards
      const cardRows = cards.map(c => mapCard(inputGame, c));
      await rpcChunk(supabase, 'catalog_v2_upsert_cards', cardRows);

      // Flatten variants and write
      const variantRows = cards.flatMap(c => (c.variants ?? []).map((v: any) => mapVariant(inputGame, { ...v, cardId: c.id, setId: c.setId })));
      if (variantRows.length) {
        await rpcChunk(supabase, 'catalog_v2_upsert_variants', variantRows);
      }

      setCards += cards.length;
      setVariants += variantRows.length;
      log('INFO', 'catalog-sync:set-page', { setId, offset, count: cards.length, totalCards: setCards });
      offset += limit;
      if (cards.length < limit) break;
    }
    
    totalCards += setCards;
    totalVariants += setVariants;
    log('INFO', 'catalog-sync:set-complete', { setId, cards: setCards, variants: setVariants });
    
    // Update last_synced_at for this set
    await supabase
      .schema('catalog_v2')
      .from('sets')
      .update({ 
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'success'
      })
      .eq('game', inputGame)
      .eq('set_id', setId);
  }

  log('INFO', 'catalog-sync:complete', { game: inputGame, totalCards, totalVariants });
  return { 
    ok: true, 
    game: inputGame, 
    cardsProcessed: totalCards, 
    variantsProcessed: totalVariants,
    setsProcessed: targetSets.length
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
          .schema('catalog_v2').from('sets')
          .select('set_id, name, last_synced_at, last_seen_at')
          .eq('game', game)
          .eq('set_id', checkSetId)
          .single();

        if (existingSet) {
          const lastUpdate = existingSet.last_synced_at || existingSet.last_seen_at;
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