import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { fetchWithRetry } from '../_shared/http.ts';
import { logStructured } from '../_shared/log.ts';
import { 
  normalizeGameSlug, 
  toJustTCGParams, 
  mapSet, 
  mapCard, 
  mapVariant,
  type SetRow,
  type CardRow,
  type VariantRow
} from '../_shared/justtcg.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const JUSTTCG_BASE_URL = 'https://api.justtcg.com/v1';

// Chunked RPC helper
async function upsertChunked<T>(
  supabase: ReturnType<typeof createClient>,
  rpcName: string,
  rows: T[],
  chunkSize: number = 500
): Promise<void> {
  if (rows.length === 0) return;
  
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.rpc(rpcName, { rows: chunk });
    
    if (error) {
      throw new Error(`${rpcName} failed for chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
    }
  }
}

// Fetch JSON with error handling
async function fetchJustTCGJSON(url: string, apiKey: string): Promise<any> {
  const headers = { 'X-API-Key': apiKey };
  const response = await fetchWithRetry(url, { headers });
  
  if (!response.ok) {
    const body = await response.text().catch(() => '(no body)');
    throw new Error(`JustTCG API error ${response.status}: ${response.statusText} - ${body}`);
  }
  
  return response.json();
}

// Main sync function
async function syncCatalog(params: {
  game: string;
  setIds?: string[];
  since?: string;
}): Promise<{
  setsProcessed: number;
  cardsProcessed: number;
  variantsProcessed: number;
}> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  const apiKey = Deno.env.get('JUSTTCG_API_KEY');
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY environment variable is required');
  }

  const normalizedGame = normalizeGameSlug(params.game);
  const { game: justTCGGame, region } = toJustTCGParams(normalizedGame);
  
  logStructured('INFO', 'Starting catalog sync', {
    originalGame: params.game,
    normalizedGame,
    justTCGGame,
    region,
    setIds: params.setIds
  });

  // Build query parameters
  const regionParam = region ? `&region=${encodeURIComponent(region)}` : '';
  const sinceParam = params.since ? `&since=${encodeURIComponent(params.since)}` : '';

  // 1. Fetch and upsert sets
  const setsUrl = `${JUSTTCG_BASE_URL}/sets?game=${encodeURIComponent(justTCGGame)}${regionParam}`;
  const setsResponse = await fetchJustTCGJSON(setsUrl, apiKey);
  const allSets = setsResponse.data || [];
  
  // Filter sets if specific setIds requested
  const targetSets = params.setIds?.length 
    ? allSets.filter((s: any) => params.setIds!.includes(s.id))
    : allSets;

  if (targetSets.length === 0) {
    logStructured('WARN', 'No sets found to sync', { game: normalizedGame, setIds: params.setIds });
    return { setsProcessed: 0, cardsProcessed: 0, variantsProcessed: 0 };
  }

  // Upsert sets
  const setRows: SetRow[] = targetSets.map((s: any) => mapSet(normalizedGame, s));
  await upsertChunked(supabase, 'catalog_v2_upsert_sets', setRows);
  
  logStructured('INFO', 'Sets upserted', { 
    count: setRows.length,
    game: normalizedGame 
  });

  // 2. Process cards and variants for each set
  let totalCards = 0;
  let totalVariants = 0;

  for (const set of targetSets) {
    const setId = set.id;
    logStructured('INFO', 'Processing set', { setId, name: set.name });

    let setCards = 0;
    let setVariants = 0;
    let offset = 0;
    const limit = 200;

    // Paginate through cards
    while (true) {
      const cardsUrl = `${JUSTTCG_BASE_URL}/cards?game=${encodeURIComponent(justTCGGame)}${regionParam}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}${sinceParam}`;
      
      const cardsResponse = await fetchJustTCGJSON(cardsUrl, apiKey);
      const cards = cardsResponse.data || [];
      
      if (cards.length === 0) break;

      // Map and upsert cards
      const cardRows: CardRow[] = cards.map((c: any) => ({
        ...mapCard(normalizedGame, c),
        set_id: setId // Ensure set_id is correct
      }));
      
      await upsertChunked(supabase, 'catalog_v2_upsert_cards', cardRows);

      // Map and upsert variants
      const variantRows: VariantRow[] = [];
      for (const card of cards) {
        if (card.variants && Array.isArray(card.variants)) {
          for (const variant of card.variants) {
            variantRows.push(mapVariant(normalizedGame, {
              ...variant,
              cardId: card.id,
              card_id: card.id
            }));
          }
        }
      }

      if (variantRows.length > 0) {
        await upsertChunked(supabase, 'catalog_v2_upsert_variants', variantRows);
      }

      setCards += cards.length;
      setVariants += variantRows.length;
      offset += limit;

      logStructured('INFO', 'Processed cards batch', {
        setId,
        batchSize: cards.length,
        variants: variantRows.length,
        totalCards: setCards,
        totalVariants: setVariants
      });

      // Break if we got less than the limit (last page)
      if (cards.length < limit) break;
    }

    totalCards += setCards;
    totalVariants += setVariants;

    // Update set sync status
    await supabase
      .schema('catalog_v2')
      .from('sets')
      .update({
        last_synced_at: new Date().toISOString()
      })
      .eq('set_id', setId)
      .eq('game', normalizedGame);

    logStructured('INFO', 'Set sync complete', {
      setId,
      name: set.name,
      cards: setCards,
      variants: setVariants
    });
  }

  logStructured('INFO', 'Catalog sync complete', {
    game: normalizedGame,
    setsProcessed: targetSets.length,
    cardsProcessed: totalCards,
    variantsProcessed: totalVariants
  });

  return {
    setsProcessed: targetSets.length,
    cardsProcessed: totalCards,
    variantsProcessed: totalVariants
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let params: any = {};

    if (req.method === 'GET') {
      const url = new URL(req.url);
      params = {
        setId: url.searchParams.get('setId'),
        game: url.searchParams.get('game') || 'pokemon',
        since: url.searchParams.get('since'),
        cooldownHours: parseInt(url.searchParams.get('cooldownHours') || '12'),
        forceSync: url.searchParams.get('forceSync') === 'true'
      };
    } else {
      params = await req.json();
    }

    const {
      setId,
      setIds,
      game = 'pokemon',
      since,
      cooldownHours = 12,
      forceSync = false
    } = params;

    const normalizedGame = normalizeGameSlug(game);
    const targetSetIds = setIds || (setId ? [setId] : undefined);

    // Cooldown check
    if (!forceSync && cooldownHours > 0 && targetSetIds) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);

      for (const checkSetId of targetSetIds) {
        const { data: existingSet } = await supabase
          .schema('catalog_v2')
          .from('sets')
          .select('set_id, name, last_synced_at')
          .eq('game', normalizedGame)
          .eq('set_id', checkSetId)
          .maybeSingle();

        if (existingSet?.last_synced_at) {
          const lastSynced = new Date(existingSet.last_synced_at);
          if (lastSynced > cooldownThreshold) {
            const minutesAgo = Math.round((Date.now() - lastSynced.getTime()) / (1000 * 60));
            const message = `Set "${existingSet.name}" was synced ${minutesAgo} minutes ago. Skipping due to ${cooldownHours}h cooldown.`;
            
            logStructured('INFO', 'Set skipped due to cooldown', {
              setId: checkSetId,
              game: normalizedGame,
              lastSynced: existingSet.last_synced_at,
              cooldownHours
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

    // Execute sync
    const result = await syncCatalog({
      game: normalizedGame,
      setIds: targetSetIds,
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
    logStructured('ERROR', 'Catalog sync failed', { 
      error: error.message,
      stack: error.stack 
    });

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