import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { JustTCGClient } from '../_shared/justtcg-client.ts';
import { SyncManager } from '../_shared/sync-manager.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { game, setId, forceResync = false } = await req.json();

  if (!game || !setId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Game and setId parameters are required' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const justTCGApiKey = Deno.env.get('JUSTTCG_API_KEY')!;

  const syncManager = new SyncManager(supabaseUrl, supabaseKey);
  const justTCGClient = new JustTCGClient(justTCGApiKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | undefined;

  try {
    console.log(`🃏 Starting JustTCG cards sync for ${game} set: ${setId}`);

    // Smart duplicate prevention
    if (!forceResync) {
      const duplicateCheck = await syncManager.checkDuplicateSync(game, setId);
      if (duplicateCheck.should_skip) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Cards sync skipped: ${duplicateCheck.reason}`,
            job_id: null
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }
    }

    // Verify set exists in our database
    const { data: setData } = await supabase
      .from('catalog_v2.sets')
      .select('*')
      .eq('game', game)
      .eq('provider_id', setId)
      .single();

    if (!setData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Set ${setId} not found for game ${game}. Please sync sets first.`
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      );
    }

    // Create sync job
    jobId = await syncManager.createJob('cards', { game, set_id: setId });
    await syncManager.startJob(jobId);

    console.log(`📋 Created job ${jobId} for ${game} set ${setId}`);

    // Update set status to indicate sync in progress
    await supabase
      .from('catalog_v2.sets')
      .update({
        sync_status: 'syncing',
        sync_job_id: jobId
      })
      .eq('game', game)
      .eq('provider_id', setId);

    const startTime = Date.now();
    
    // Get API game ID
    const apiGameId = Object.entries({
      'mtg': 'magic-the-gathering',
      'pokemon': 'pokemon', 
      'yugioh': 'yu-gi-oh',
      'dbs': 'dragon-ball-super',
      'onepiece': 'one-piece'
    }).find(([normalized, _]) => normalized === game)?.[1] || game;

    const processedCards: any[] = [];
    const processedVariants: any[] = [];
    let totalCards = 0;
    let processed = 0;

    // Fetch cards from API with pagination
    for await (const cardsPage of justTCGClient.getCards(apiGameId, setId)) {
      totalCards += cardsPage.length;
      
      // Update progress with new total
      await syncManager.updateProgress(jobId, processed, totalCards);

      // Process cards in batches of 25
      await syncManager.batchProcess(
        cardsPage,
        async (cardsBatch) => {
          const cardResults: any[] = [];
          
          for (const apiCard of cardsBatch) {
            try {
              // Prepare card data
              const cardData = {
                card_id: crypto.randomUUID(),
                game: game,
                provider_id: apiCard.id,
                set_provider_id: setId,
                name: apiCard.name,
                number: apiCard.number,
                justtcg_id: apiCard.id,
                justtcg_card_id: apiCard.id,
                tcgplayer_id: apiCard.tcgplayer_product_id,
                justtcg_metadata: {
                  rarity: apiCard.rarity,
                  images: apiCard.images,
                  synced_at: new Date().toISOString()
                }
              };

              // Upsert card to database
              const { data: insertedCard, error: cardError } = await supabase
                .from('catalog_v2.cards')
                .upsert(cardData, {
                  onConflict: 'game,provider_id',
                  ignoreDuplicates: false
                })
                .select('card_id')
                .single();

              if (cardError) {
                console.error(`❌ Failed to upsert card ${apiCard.id}:`, cardError);
                continue;
              }

              processedCards.push({
                id: apiCard.id,
                name: apiCard.name,
                number: apiCard.number,
                internal_id: insertedCard.card_id
              });

              // Fetch and process variants for this card
              try {
                for await (const variantsPage of justTCGClient.getVariants(apiGameId, apiCard.id)) {
                  for (const apiVariant of variantsPage) {
                    const variantData = {
                      variant_id: crypto.randomUUID(),
                      game: game,
                      provider_id: apiVariant.id,
                      card_provider_id: apiCard.id,
                      sku: apiVariant.id,
                      justtcg_variant_id: apiVariant.id,
                      price_history: [{
                        price: apiVariant.price,
                        market_price: apiVariant.market_price,
                        recorded_at: new Date().toISOString()
                      }],
                      justtcg_metadata: {
                        language: apiVariant.language,
                        printing: apiVariant.printing,
                        condition: apiVariant.condition,
                        synced_at: new Date().toISOString()
                      }
                    };

                    const { error: variantError } = await supabase
                      .from('catalog_v2.variants')
                      .upsert(variantData, {
                        onConflict: 'game,provider_id',
                        ignoreDuplicates: false
                      });

                    if (!variantError) {
                      processedVariants.push({
                        id: apiVariant.id,
                        card_id: apiCard.id,
                        price: apiVariant.price
                      });
                    }
                  }
                }
              } catch (variantError) {
                console.error(`⚠️ Failed to sync variants for card ${apiCard.id}:`, variantError);
              }

              cardResults.push(apiCard);

            } catch (error) {
              console.error(`❌ Error processing card ${apiCard.id}:`, error);
            }
          }

          return cardResults;
        },
        25, // Batch size
        async (processedCount, total) => {
          processed = processedCount;
          await syncManager.updateProgress(jobId!, processedCount, total);
          
          if (processedCount % 50 === 0) {
            console.log(`📊 Progress: ${processedCount}/${total} cards processed`);
          }
        }
      );

      // Memory cleanup after each page
      if (global.gc) {
        global.gc();
      }
    }

    // Update set with final card count and sync status
    await supabase
      .from('catalog_v2.sets')
      .update({
        sync_status: 'synced',
        card_count: processedCards.length,
        last_synced_at: new Date().toISOString()
      })
      .eq('game', game)
      .eq('provider_id', setId);

    const endTime = Date.now();
    const duration = endTime - startTime;
    const requestCount = justTCGClient.getRequestCount();

    const results = {
      game: game,
      set_id: setId,
      set_name: setData.name,
      total_cards: totalCards,
      processed_cards: processedCards.length,
      processed_variants: processedVariants.length,
      cards: processedCards.slice(0, 100), // Limit response size
      variants_sample: processedVariants.slice(0, 50)
    };

    const metrics = {
      duration_ms: duration,
      api_requests: requestCount,
      cards_per_second: processedCards.length / (duration / 1000),
      variants_per_card: processedVariants.length / Math.max(processedCards.length, 1),
      start_time: startTime,
      end_time: endTime,
      game: game,
      set_id: setId
    };

    // Complete the job
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 Cards sync completed for ${game} set ${setId}!`);
    console.log(`📊 Processed ${processedCards.length} cards and ${processedVariants.length} variants in ${duration}ms`);
    console.log(`📡 Made ${requestCount} API requests`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedCards.length} cards for set ${setId}`,
        {
          game,
          set_id: setId,
          cards: processedCards.length,
          variants: processedVariants.length,
          duration_ms: duration,
          api_requests: requestCount
        }
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error(`💥 Cards sync failed for ${game} set ${setId}:`, error);

    // Update set status to failed
    if (setId && game) {
      await supabase
        .from('catalog_v2.sets')
        .update({
          sync_status: 'failed'
        })
        .eq('game', game)
        .eq('provider_id', setId);
    }

    if (jobId) {
      await syncManager.completeJob(
        jobId,
        'failed',
        { game, set_id: setId },
        { error_type: error.name || 'UnknownError', game, set_id: setId },
        error.message
      );
    }

    return new Response(
      JSON.stringify(syncManager.createResult(
        false,
        jobId || 'unknown',
        `Cards sync failed for ${game} set ${setId}`,
        { game, set_id: setId },
        error.message
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});