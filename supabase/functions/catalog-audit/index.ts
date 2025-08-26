import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const GAME_MAP = new Map<string, string>([
  ['mtg', 'magic-the-gathering'],
  ['magic-the-gathering', 'magic-the-gathering'],
  ['pokemon', 'pokemon'],
  ['pokemon-japan', 'pokemon-japan'],
]);

function normalizeGame(game: string): string {
  const key = game.trim().toLowerCase();
  return GAME_MAP.get(key) ?? key;
}

// Structured logging helper
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  console.log(JSON.stringify(logEntry));
}

// Performance tracking helper
class PerformanceTracker {
  private startTime: number;
  private context: Record<string, any>;

  constructor(context: Record<string, any> = {}) {
    this.startTime = Date.now();
    this.context = context;
  }

  log(message: string, additionalContext: Record<string, any> = {}) {
    const durationMs = Date.now() - this.startTime;
    logStructured('INFO', message, {
      ...this.context,
      ...additionalContext,
      durationMs
    });
  }

  error(message: string, error: any, additionalContext: Record<string, any> = {}) {
    const durationMs = Date.now() - this.startTime;
    logStructured('ERROR', message, {
      ...this.context,
      ...additionalContext,
      durationMs,
      error: error?.message || error,
      stack: error?.stack
    });
  }
}

// Get API key from env or system_settings table
async function getApiKey(): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabaseClient.from('system_settings').select('key_value').eq('key_name', 'JUSTTCG_API_KEY').single();
  if (data?.key_value) return data.key_value;
  
  throw new Error("JUSTTCG_API_KEY not found in environment or system_settings");
}

// Helper functions for API requests with retry logic
async function backoffWait(ms: number) { 
  return new Promise(r => setTimeout(r, ms)); 
}

async function fetchJsonWithRetry(url: string, headers: HeadersInit = {}, tries = 6, baseDelayMs = 500, context: Record<string, any> = {}) {
  let lastError: any;
  for (let i = 0; i < tries; i++) {
    const attemptStart = Date.now();
    try {
      const res = await fetch(url, { headers });
      const durationMs = Date.now() - attemptStart;
      
      if (!res.ok) {
        logStructured('WARN', `HTTP error on attempt ${i + 1}`, {
          ...context,
          url,
          status: res.status,
          statusText: res.statusText,
          attempt: i + 1,
          durationMs
        });
        
        if (res.status === 429 || res.status >= 500) { 
          await backoffWait(baseDelayMs * 2**i); 
          continue; 
        }
        throw new Error(`${url} ${res.status} ${await res.text().catch(() => '')}`);
      }
      
      return await res.json();
    } catch (e) {
      lastError = e;
      const durationMs = Date.now() - attemptStart;
      
      logStructured('ERROR', `Request failed on attempt ${i + 1}`, {
        ...context,
        url,
        attempt: i + 1,
        error: e?.message || e,
        durationMs
      });
      
      await backoffWait(baseDelayMs * 2**i);
    }
  }
  throw lastError || new Error(`retry_exhausted ${url}`);
}

// Fetch all upstream sets for a game
async function fetchUpstreamSets(game: string, apiKey: string, setId?: string): Promise<any[]> {
  const tracker = new PerformanceTracker({
    operation: 'fetch_upstream_sets',
    game,
    setId
  });

  const headers = { "X-API-Key": apiKey };
  const apiGame = normalizeGame(game);
  
  if (setId) {
    // Fetch single set
    const url = `${JUSTTCG_BASE}/sets?game=${encodeURIComponent(apiGame)}&id=${encodeURIComponent(setId)}`;
    const response = await fetchJsonWithRetry(url, headers, 6, 500, {
      operation: 'fetch_single_set',
      game,
      setId
    });
    
    const sets = response?.data || [];
    tracker.log('Single set fetched', { count: sets.length });
    return sets;
  }
  
  // Fetch all sets with pagination
  let allSets: any[] = [];
  let limit = 100;
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;
  
  while (hasMore) {
    pageCount++;
    const url = `${JUSTTCG_BASE}/sets?game=${encodeURIComponent(apiGame)}&limit=${limit}&offset=${offset}`;
    
    const response = await fetchJsonWithRetry(url, headers, 6, 500, {
      operation: 'fetch_sets_page',
      game,
      page: pageCount
    });
    
    const sets = response?.data || [];
    
    if (sets.length === 0) {
      hasMore = false;
      break;
    }
    
    allSets = allSets.concat(sets);
    hasMore = response?.meta?.hasMore || false;
    offset += limit;
  }
  
  tracker.log('All sets fetched', { 
    pageCount, 
    totalSets: allSets.length 
  });
  
  return allSets;
}

// Fetch all upstream cards and variants for sets
async function fetchUpstreamCardsAndVariants(game: string, setIds: string[], apiKey: string): Promise<{cards: any[], variants: any[]}> {
  const tracker = new PerformanceTracker({
    operation: 'fetch_upstream_cards_variants',
    game,
    setCount: setIds.length
  });

  const headers = { "X-API-Key": apiKey };
  const apiGame = normalizeGame(game);
  
  let allCards: any[] = [];
  let allVariants: any[] = [];
  let nonJapaneseVariants = 0;
  
  for (const setId of setIds) {
    let limit = 100;
    let offset = 0;
    let hasMore = true;
    
    while (hasMore) {
      const url = `${JUSTTCG_BASE}/cards?game=${encodeURIComponent(apiGame)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
      
      const response = await fetchJsonWithRetry(url, headers, 6, 500, {
        operation: 'fetch_cards_page',
        game,
        setId,
        offset
      });
      
      const cards = response?.data || [];
      
      if (cards.length === 0) {
        hasMore = false;
        break;
      }
      
      // Process cards and their variants
      for (const card of cards) {
        allCards.push(card);
        
        let variants = card.variants || [];
        
        // Defensive check: warn if pokemon-japan variant is not Japanese
        if (game === 'pokemon-japan') {
          for (const variant of variants) {
            if (variant.language && variant.language !== 'Japanese') {
              nonJapaneseVariants++;
              logStructured('WARN', 'Non-Japanese variant in pokemon-japan audit', {
                operation: 'fetch_upstream_cards_variants',
                game,
                setId,
                cardId: card.id,
                variantLanguage: variant.language,
                expectedLanguage: 'Japanese'
              });
            }
          }
        }
        
        allVariants = allVariants.concat(variants);
      }
      
      hasMore = response?.meta?.hasMore || false;
      offset += limit;
    }
  }
  
  if (nonJapaneseVariants > 0) {
    logStructured('WARN', `Found ${nonJapaneseVariants} non-Japanese variants in pokemon-japan audit`, {
      operation: 'fetch_upstream_cards_variants',
      game,
      nonJapaneseVariants
    });
  }
  
  tracker.log('Cards and variants fetched', {
    totalCards: allCards.length,
    totalVariants: allVariants.length,
    nonJapaneseVariants
  });
  
  return { cards: allCards, variants: allVariants };
}

// Fetch local data from database
async function fetchLocalData(game: string, setIds?: string[]): Promise<{sets: any[], cards: any[], variants: any[]}> {
  const tracker = new PerformanceTracker({
    operation: 'fetch_local_data',
    game,
    setCount: setIds?.length
  });

  let setsQuery = supabaseClient
    .from('catalog_v2.sets')
    .select('*')
    .eq('game', game);
    
  if (setIds && setIds.length > 0) {
    setsQuery = setsQuery.in('set_id', setIds);
  }
  
  const { data: sets, error: setsError } = await setsQuery;
  if (setsError) throw setsError;
  
  let cardsQuery = supabaseClient
    .from('catalog_v2.cards')
    .select('*')
    .eq('game', game);
    
  if (setIds && setIds.length > 0) {
    cardsQuery = cardsQuery.in('set_id', setIds);
  }
  
  const { data: cards, error: cardsError } = await cardsQuery;
  if (cardsError) throw cardsError;
  
  let variantsQuery = supabaseClient
    .from('catalog_v2.variants')
    .select('*')
    .eq('game', game);
    
  if (setIds && setIds.length > 0) {
    variantsQuery = variantsQuery.in('set_id', setIds);
  }
  
  const { data: variants, error: variantsError } = await variantsQuery;
  if (variantsError) throw variantsError;
  
  tracker.log('Local data fetched', {
    sets: sets?.length || 0,
    cards: cards?.length || 0,
    variants: variants?.length || 0
  });
  
  return {
    sets: sets || [],
    cards: cards || [],
    variants: variants || []
  };
}

// Compute differences between upstream and local data
function computeDiffs(upstream: any, local: any) {
  const tracker = new PerformanceTracker({
    operation: 'compute_diffs'
  });

  // Create lookup maps for local data
  const localSetsMap = new Map(local.sets.map((s: any) => [s.set_id, s]));
  const localCardsMap = new Map(local.cards.map((c: any) => [c.card_id, c]));
  const localVariantsMap = new Map(local.variants.map((v: any) => [v.variant_key || `${v.card_id}-${v.language}-${v.printing}-${v.condition}`, v]));
  
  // Find missing sets
  const missingSets: string[] = [];
  for (const set of upstream.sets) {
    if (!localSetsMap.has(set.id)) {
      missingSets.push(set.id);
    }
  }
  
  // Find missing cards
  const missingCards: string[] = [];
  for (const card of upstream.cards) {
    if (!localCardsMap.has(card.id)) {
      missingCards.push(card.id);
    }
  }
  
  // Find missing variants
  const missingVariants: string[] = [];
  const staleVariants: string[] = [];
  
  for (const variant of upstream.variants) {
    const variantKey = variant.id || `${variant.cardId || variant.card_id}-${variant.language}-${variant.printing}-${variant.condition}`;
    const localVariant = localVariantsMap.get(variantKey);
    
    if (!localVariant) {
      missingVariants.push(variantKey);
    } else {
      // Check if stale (simplified - could be enhanced with actual timestamp comparison)
      if (variant.updatedAt && localVariant.updated_from_source_at) {
        const upstreamDate = new Date(variant.updatedAt);
        const localDate = new Date(localVariant.updated_from_source_at);
        if (upstreamDate > localDate) {
          staleVariants.push(variantKey);
        }
      }
    }
  }
  
  const result = {
    totals: {
      sets_upstream: upstream.sets.length,
      sets_local: local.sets.length,
      sets_missing: missingSets.length,
      cards_upstream: upstream.cards.length,
      cards_local: local.cards.length,
      cards_missing: missingCards.length,
      variants_upstream: upstream.variants.length,
      variants_local: local.variants.length,
      variants_missing: missingVariants.length,
      variants_stale: staleVariants.length
    },
    sampleMissing: {
      sets: missingSets.slice(0, 10),
      cards: missingCards.slice(0, 10),
      variants: missingVariants.slice(0, 10)
    },
    missing: {
      sets: missingSets,
      cards: missingCards,
      variants: missingVariants
    },
    stale: {
      variants: staleVariants
    }
  };
  
  tracker.log('Diffs computed', result.totals);
  
  return result;
}

// Format output as CSV
function formatAsCsv(diffs: any, game: string, scope: string): string {
  const rows: string[] = [];
  rows.push('level,setId,cardId,variantId,issue,detail');
  
  // Missing sets
  for (const setId of diffs.missing.sets) {
    rows.push(`set,${setId},,,missing,"Set ${setId} not found in local database"`);
  }
  
  // Missing cards  
  for (const cardId of diffs.missing.cards) {
    rows.push(`card,,${cardId},,missing,"Card ${cardId} not found in local database"`);
  }
  
  // Missing variants
  for (const variantId of diffs.missing.variants) {
    rows.push(`variant,,,${variantId},missing,"Variant ${variantId} not found in local database"`);
  }
  
  // Stale variants
  for (const variantId of diffs.stale.variants) {
    rows.push(`variant,,,${variantId},stale,"Variant ${variantId} is stale - upstream has newer data"`);
  }
  
  return rows.join('\n');
}

// Generate next actions based on diffs
function generateNextActions(diffs: any, game: string, setId?: string): string[] {
  const actions: string[] = [];
  
  if (diffs.totals.sets_missing > 0) {
    if (setId) {
      actions.push(`Run 'Sync Now' for set ${setId} to add missing set`);
    } else {
      actions.push(`Run 'Incremental' sync to add ${diffs.totals.sets_missing} missing sets`);
    }
  }
  
  if (diffs.totals.cards_missing > 0) {
    if (setId) {
      actions.push(`Run 'Sync Now' for set ${setId} to add ${diffs.totals.cards_missing} missing cards`);
    } else {
      actions.push(`Run 'Queue Pending Sets' to sync missing cards across ${diffs.sampleMissing.sets.length} sets`);
    }
  }
  
  if (diffs.totals.variants_missing > 0 || diffs.totals.variants_stale > 0) {
    const variantIssues = diffs.totals.variants_missing + diffs.totals.variants_stale;
    if (setId) {
      actions.push(`Run 'Sync Now' for set ${setId} to update ${variantIssues} variant issues`);
    } else {
      actions.push(`Run 'Incremental' sync to update ${variantIssues} variant issues`);
    }
  }
  
  if (actions.length === 0) {
    actions.push('No sync required - catalog is up to date');
  }
  
  return actions;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const requestBody = req.method === 'POST' ? await req.json() : {};
    
    // Extract parameters from query string or request body
    const game = (url.searchParams.get("game") || requestBody.game || "").trim().toLowerCase();
    const setId = (url.searchParams.get("setId") || requestBody.setId || "").trim();
    const exportFormat = (url.searchParams.get("export") || requestBody.export || "json").toLowerCase();

    const requestTracker = new PerformanceTracker({
      operation: 'catalog_audit_request',
      game,
      setId: setId || 'all',
      exportFormat
    });

    // Validate game parameter
    if (!["mtg", "pokemon", "pokemon-japan"].includes(game)) {
      requestTracker.error('Invalid game parameter', new Error(`Invalid game: ${game}`), {
        status: 'validation_error'
      });
      return new Response(
        JSON.stringify({ error: "Invalid game. Must be 'mtg', 'pokemon', or 'pokemon-japan'" }), 
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = await getApiKey();
    
    // Fetch upstream data
    const upstreamSets = await fetchUpstreamSets(game, apiKey, setId);
    const setIds = setId ? [setId] : upstreamSets.map(s => s.id);
    
    const { cards: upstreamCards, variants: upstreamVariants } = await fetchUpstreamCardsAndVariants(
      game, 
      setIds, 
      apiKey
    );
    
    // Fetch local data
    const localData = await fetchLocalData(game, setIds);
    
    // Compute differences
    const diffs = computeDiffs(
      { sets: upstreamSets, cards: upstreamCards, variants: upstreamVariants },
      localData
    );
    
    // Generate next actions
    const nextActions = generateNextActions(diffs, game, setId);
    
    const scope = setId ? `set:${setId}` : 'all';
    const mode = game;
    
    // Prepare response
    const response = {
      mode,
      scope,
      totals: diffs.totals,
      sampleMissing: diffs.sampleMissing,
      nextActions
    };
    
    requestTracker.log('Audit completed successfully', {
      status: 'success',
      ...diffs.totals
    });
    
    // Return CSV if requested
    if (exportFormat === 'csv') {
      const csvContent = formatAsCsv(diffs, game, scope);
      return new Response(csvContent, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="catalog-audit-${game}-${scope}-${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }
    
    // Return JSON response
    return new Response(
      JSON.stringify(response, null, 2), 
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    logStructured('ERROR', 'Catalog audit failed', {
      operation: 'catalog_audit_request',
      error: error?.message || error,
      stack: error?.stack
    });

    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Internal server error',
        details: error?.stack
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});