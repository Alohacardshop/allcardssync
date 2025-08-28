import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Normalize game slugs for JustTCG API
function normalizeGameSlug(game: string): string {
  switch (game) {
    case 'pokemon_japan':
    case 'pokemon-japan':
      return 'pokemon-japan';  // JustTCG API expects hyphen
    case 'pokemon':
      return 'pokemon';
    case 'mtg':
    case 'magic-the-gathering':
      return 'magic-the-gathering';
    default:
      return game;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let setId, game, since, queueOnly, turbo, cooldownHours, forceSync;
    
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
      game = body.game || url.searchParams.get("game") || "pokemon";
      since = body.since || url.searchParams.get("since") || "";
      queueOnly = body.queueOnly || url.searchParams.get("queueOnly") === "true";
      turbo = body.turbo || url.searchParams.get("turbo") === "true";
      cooldownHours = parseInt(body.cooldownHours || url.searchParams.get("cooldownHours") || "12");
      forceSync = body.forceSync || url.searchParams.get("forceSync") === "true";
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Log the request
    logStructured('INFO', 'Catalog sync request started', {
      operation: 'catalog_sync_request',
      game,
      setId,
      since,
      queueOnly,
      turbo,
      cooldownHours: cooldownHours.toString(),
      forceSync
    });

    const startTime = Date.now();

    try {
      // Check cooldown if not forcing sync
      if (!forceSync && cooldownHours > 0 && setId && !queueOnly) {
        const cooldownThreshold = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
        
        const { data: existingSet, error: setCheckError } = await supabaseClient
          .from('catalog_v2.sets')
          .select('set_id, name, last_synced_at, last_seen_at')
          .eq('game', game)
          .eq('set_id', setId)
          .single();

        if (setCheckError) {
          logStructured('ERROR', 'Cooldown check failed', {
            operation: 'catalog_sync_request',
            game,
            setId,
            since,
            durationMs: Date.now() - startTime,
            error: setCheckError.message
          });
          // Continue with sync despite error
        } else if (existingSet) {
          // Use last_synced_at if available, otherwise fall back to last_seen_at
          const lastUpdate = existingSet.last_synced_at || existingSet.last_seen_at;
          if (lastUpdate && new Date(lastUpdate) > cooldownThreshold) {
            const message = `Set "${existingSet.name}" was last synced ${Math.round((Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60))} minutes ago. Skipping due to ${cooldownHours}h cooldown.`;
            
            logStructured('INFO', 'Set skipped due to cooldown', {
              operation: 'catalog_sync_request',
              game,
              setId,
              since,
              status: 'skipped_cooldown',
              lastSyncedAt: existingSet.last_synced_at,
              lastSeenAt: existingSet.last_seen_at,
              cooldownHours,
              durationMs: Date.now() - startTime
            });

            return new Response(
              JSON.stringify({ 
                status: 'skipped_cooldown', 
                message,
                setId,
                setName: existingSet.name,
                lastSyncedAt: existingSet.last_synced_at,
                lastSeenAt: existingSet.last_seen_at
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (cooldownError) {
      logStructured('ERROR', 'Cooldown check failed', {
        operation: 'catalog_sync_request',
        game,
        setId,
        since,
        durationMs: Date.now() - startTime,
        error: cooldownError.message
      });
      // Continue with sync despite cooldown check failure
    }

    // Function to queue sets for sync
    async function queueSets(game: string, sets: string[], mode: string = 'normal') {
      let queued = 0;
      for (const set_id of sets) {
        const { error } = await supabaseClient
          .from('sync_queue')
          .insert({
            game: game,
            set_id: set_id,
            mode: mode,
            status: 'queued'
          });

        if (error) {
          logStructured('ERROR', 'Failed to queue set', {
            operation: 'queue_sets',
            game,
            set_id,
            error: error.message
          });
        } else {
          queued++;
        }
      }
      return queued;
    }

    // Function to fetch cards for a set
    async function fetchCards(game: string, setId: string, since: string = ""): Promise<any[]> {
      let allCards: any[] = [];
      let offset = 0;
      const limit = 100; // Adjust as needed

      // Use original game slug for internal communication
      const gameSlug = game;

      while (true) {
        const url = `${supabaseUrl}/functions/v1/justtcg-cards?game=${encodeURIComponent(gameSlug)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}&since=${encodeURIComponent(since)}`;
        
        logStructured('INFO', 'Fetching cards batch', {
          operation: 'fetch_cards',
          game: gameSlug,
          setId,
          offset,
          limit
        });

        const response = await fetch(url, {
          headers: {
            ...corsHeaders,
            'apikey': supabaseServiceKey,
            'Authorization': `Bearer ${supabaseServiceKey}`
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          logStructured('ERROR', 'Failed to fetch cards', {
            operation: 'fetch_cards',
            game,
            setId,
            since,
            status: response.status,
            error: errorText
          });
          throw new Error(`Failed to fetch cards: ${response.status} - ${errorText}`);
        }

        const { data, error } = await response.json();

        if (error) {
          logStructured('ERROR', 'Failed to parse cards', {
            operation: 'fetch_cards',
            game,
            setId,
            since,
            error: error.message
          });
          throw new Error(`Failed to parse cards: ${error.message}`);
        }

        if (!data || data.length === 0) {
          break; // No more cards
        }

        allCards = allCards.concat(data);
        offset += limit;

        if (data.length < limit) {
          break; // Last page
        }
      }

      return allCards;
    }

    // Function to fetch variants for a card
    async function fetchVariants(game: string, cardId: string): Promise<any[]> {
      const url = `${supabaseUrl}/functions/v1/justtcg-variants?game=${encodeURIComponent(game)}&cardId=${encodeURIComponent(cardId)}`;
      const response = await fetch(url, {
        headers: {
          ...corsHeaders,
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logStructured('ERROR', 'Failed to fetch variants', {
          operation: 'fetch_variants',
          game,
          cardId,
          status: response.status,
          error: errorText
        });
        throw new Error(`Failed to fetch variants: ${response.status} - ${errorText}`);
      }

      const { data, error } = await response.json();

      if (error) {
        logStructured('ERROR', 'Failed to parse variants', {
          operation: 'fetch_variants',
          game,
          cardId,
          error: error.message
        });
        throw new Error(`Failed to parse variants: ${error.message}`);
      }

      return data || [];
    }

    // Function to upsert sets
    async function upsertSets(sets: any[]): Promise<void> {
      if (sets.length === 0) return;

      const { data, error } = await supabaseClient
        .from('catalog_v2.sets')
        .upsert(sets, { onConflict: 'game, set_id' });

      if (error) {
        logStructured('ERROR', 'Failed to upsert sets', {
          operation: 'upsert_sets',
          error: error.message,
          sets
        });
        throw new Error(`Failed to upsert sets: ${error.message}`);
      }
    }

    // Function to upsert cards
    async function upsertCards(cards: any[]): Promise<void> {
      if (cards.length === 0) return;

      const { data, error } = await supabaseClient
        .from('catalog_v2.cards')
        .upsert(cards, { onConflict: 'game, card_id' });

      if (error) {
        logStructured('ERROR', 'Failed to upsert cards', {
          operation: 'upsert_cards',
          error: error.message,
          cards
        });
        throw new Error(`Failed to upsert cards: ${error.message}`);
      }
    }

    // Function to upsert variants
    async function upsertVariants(variants: any[]): Promise<void> {
      if (variants.length === 0) return;

      const { data, error } = await supabaseClient
        .from('catalog_v2.variants')
        .upsert(variants, { onConflict: 'game, variant_id' });

      if (error) {
        logStructured('ERROR', 'Failed to upsert variants', {
          operation: 'upsert_variants',
          error: error.message,
          variants
        });
        throw new Error(`Failed to upsert variants: ${error.message}`);
      }
    }

    // Main sync logic
    async function syncSet(game: string, setId: string, since: string = ""): Promise<any> {
      let cardsProcessed = 0;
      let variantsProcessed = 0;
      const errors: string[] = [];
      const warnings: string[] = [];

      try {
        // 1. Fetch cards
        const cards = await fetchCards(game, setId, since);
        logStructured('INFO', 'Fetched cards', {
          operation: 'sync_set',
          game,
          setId,
          count: cards.length
        });
        cardsProcessed = cards.length;

        // 2. Upsert cards
        await upsertCards(cards);
        logStructured('INFO', 'Upserted cards', {
          operation: 'sync_set',
          game,
          setId,
          count: cards.length
        });

        // 3. Fetch and upsert variants (concurrently)
        const variantPromises = cards.map(async (card) => {
          try {
            const variants = await fetchVariants(game, card.card_id);
            await upsertVariants(variants);
            variantsProcessed += variants.length;
            return variants.length;
          } catch (variantError: any) {
            errors.push(`Failed to process variants for card ${card.card_id}: ${variantError.message}`);
            return 0;
          }
        });

        await Promise.all(variantPromises);
        logStructured('INFO', 'Upserted variants', {
          operation: 'sync_set',
          game,
          setId,
          count: variantsProcessed
        });

      } catch (syncError: any) {
        errors.push(`Sync failed: ${syncError.message}`);
        logStructured('ERROR', 'Sync failed', {
          operation: 'sync_set',
          game,
          setId,
          error: syncError.message
        });
      }

      return {
        cardsProcessed,
        variantsProcessed,
        errors,
        warnings
      };
    }

    // Orchestrate the sync process
    let result: any = {};
    if (setId) {
      // Sync a single set
      logStructured('INFO', 'Syncing single set', {
        operation: 'sync',
        game,
        setId
      });
      result = await syncSet(game, setId, since);
    } else {
      // Queue all sets for a game
      logStructured('INFO', 'Queueing all sets for game', {
        operation: 'sync',
        game
      });

      // Fetch all sets for the game
      const url = `${supabaseUrl}/functions/v1/justtcg-sets?game=${encodeURIComponent(game)}`;
      
      logStructured('INFO', 'Fetching sets for game', {
        operation: 'fetch_sets',
        game,
        url
      });

      const response = await fetch(url, {
        headers: {
          ...corsHeaders,
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        logStructured('ERROR', 'Failed to fetch sets', {
          operation: 'queue_all',
          game,
          status: response.status,
          error: errorText
        });
        throw new Error(`Failed to fetch sets: ${response.status} - ${errorText}`);
      }

      const { data: sets, error: setsError } = await response.json();

      if (setsError) {
        logStructured('ERROR', 'Failed to parse sets', {
          operation: 'queue_all',
          game,
          error: setsError.message
        });
        throw new Error(`Failed to parse sets: ${setsError.message}`);
      }

      if (!sets || sets.length === 0) {
        logStructured('WARN', 'No sets found for game', {
          operation: 'queue_all',
          game
        });
        return new Response(
          JSON.stringify({ status: 'no_sets', message: `No sets found for game: ${game}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Queue the sets
      const setIds = sets.map((set: any) => set.id);
      const queuedCount = await queueSets(game, setIds);

      logStructured('INFO', 'Queued sets for sync', {
        operation: 'queue_all',
        game,
        queued: queuedCount,
        total: sets.length
      });

      result = {
        setsQueued: queuedCount,
        totalSets: sets.length
      };
    }

    // For single set sync, update last_synced_at after successful sync
    if (setId && !queueOnly) {
      const { data: syncedSets, errors, warnings } = result;
      
      if (syncedSets && syncedSets.length > 0) {
        try {
          const { error: updateError } = await supabaseClient
            .from('catalog_v2.sets')
            .update({
              last_synced_at: new Date().toISOString(),
              last_sync_status: 'success',
              last_sync_message: `Synced ${result.cardsProcessed} cards, ${result.variantsProcessed} variants`
            })
            .eq('game', game)
            .eq('set_id', setId);

          if (updateError) {
            logStructured('WARN', 'Failed to update sync timestamp', {
              operation: 'catalog_sync_request',
              game,
              setId,
              error: updateError.message
            });
          }
        } catch (timestampError) {
          logStructured('WARN', 'Failed to update sync timestamp', {
            operation: 'catalog_sync_request',
            game,
            setId,
            error: timestampError.message
          });
        }
      }

      logStructured('INFO', 'Single set sync completed', {
        operation: 'catalog_sync_request',
        game,
        setId,
        since,
        status: errors.length > 0 ? 'completed_with_errors' : 'success',
        mode: 'single_set',
        setsProcessed: result.setsProcessed,
        cardsProcessed: result.cardsProcessed,
        variantsProcessed: result.variantsProcessed,
        skipped: {
          sets: result.skippedSets || 0,
          cards: result.skippedCards || 0
        },
        errors,
        warnings,
        durationMs: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({
          status: errors.length > 0 ? 'completed_with_errors' : 'success',
          message: `Sync completed for ${game} set: ${setId}`,
          setsProcessed: result.setsProcessed,
          cardsProcessed: result.cardsProcessed,
          variantsProcessed: result.variantsProcessed,
          errors,
          warnings
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Respond based on the operation
    if (setId) {
      logStructured('INFO', 'Sync completed', {
        operation: 'catalog_sync',
        game,
        setId,
        since,
        status: 'completed',
        mode: 'single_set',
        setsProcessed: result.setsProcessed,
        cardsProcessed: result.cardsProcessed,
        variantsProcessed: result.variantsProcessed,
        errors: result.errors,
        warnings: result.warnings,
        durationMs: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({
          status: 'completed',
          message: `Sync completed for ${game} set: ${setId}`,
          setsProcessed: result.setsProcessed,
          cardsProcessed: result.cardsProcessed,
          variantsProcessed: result.variantsProcessed,
          errors: result.errors,
          warnings: result.warnings
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      logStructured('INFO', 'Queueing completed', {
        operation: 'catalog_sync',
        game,
        status: 'queued',
        setsQueued: result.setsQueued,
        totalSets: result.totalSets,
        durationMs: Date.now() - startTime
      });

      return new Response(
        JSON.stringify({
          status: 'queued',
          message: `Queued ${result.setsQueued} sets for game: ${game}`,
          setsQueued: result.setsQueued,
          totalSets: result.totalSets
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    logStructured('ERROR', 'Sync failed', {
      operation: 'catalog_sync',
      error: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function for structured logging
function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context
  };
  console.log(JSON.stringify(logEntry));
}
