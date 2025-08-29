import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { JustTCGClientPremium } from '../_shared/justtcg-client-premium.ts';
import { SyncManagerPremium } from '../_shared/sync-manager-premium.ts';

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

  const syncManager = new SyncManagerPremium(supabaseUrl, supabaseKey);
  await syncManager.loadConfig();
  
  const justTCGClient = new JustTCGClientPremium(
    justTCGApiKey,
    {
      cardsPerRequest: syncManager.getConfig('batch_size_cards', 200),
      setsPerRequest: syncManager.getConfig('batch_size_sets', 100),
      variantsPerRequest: syncManager.getConfig('batch_size_variants', 200),
      requestsPerMinute: syncManager.getConfig('requests_per_minute', 400),
      delayBetweenCalls: syncManager.getConfig('api_rate_limit_ms', 150),
      apiTimeout: syncManager.getConfig('api_timeout_ms', 60000),
      maxRetries: syncManager.getConfig('max_retries', 3)
    },
    // API usage callback
    async (count) => await syncManager.recordApiUsage(count)
  );

  const supabase = createClient(supabaseUrl, supabaseKey);
  let jobId: string | undefined;

  try {
    console.log(`🃏 Starting PREMIUM JustTCG cards sync for ${game} set: ${setId}`);
    console.log(`🚀 Using premium settings: ${syncManager.getConfig('batch_size_cards', 200)} cards per request`);

    // Check API usage before starting
    await syncManager.checkApiUsageLimits();

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

    console.log(`📋 Created premium job ${jobId} for ${game} set ${setId}`);

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

    // Enhanced batch processing with premium settings
    const progressInterval = syncManager.getConfig('progress_update_interval_cards', 50);
    const dbBatchSize = syncManager.getConfig('db_batch_size', 50);

    // Fetch cards from API with premium pagination
    for await (const cardsPage of justTCGClient.getCards(apiGameId, setId)) {
      totalCards += cardsPage.length;
      
      // Update progress with new total
      await syncManager.updateProgress(jobId, processed, totalCards);

      // Process cards using parallel batch processing
      await syncManager.parallelBatchProcess(
        cardsPage,
        async (cardsBatch) => {
          const cardResults: any[] = [];
          const variantBatches: any[] = [];
          
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

              cardResults.push(cardData);

              // Fetch variants for this card in parallel
              try {
                for await (const variantsPage of justTCGClient.getVariants(apiGameId, apiCard.id)) {
                  for (const apiVariant of variantsPage) {
                    variantBatches.push({
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
                    });
                  }
                }
              } catch (variantError) {
                console.error(`⚠️ Failed to sync variants for card ${apiCard.id}:`, variantError);
              }

            } catch (error) {
              console.error(`❌ Error processing card ${apiCard.id}:`, error);
            }
          }

          // Batch insert cards
          if (cardResults.length > 0) {
            const { error: cardError } = await supabase
              .from('catalog_v2.cards')
              .upsert(cardResults, {
                onConflict: 'game,provider_id',
                ignoreDuplicates: false
              });

            if (cardError) {
              console.error('❌ Failed to batch insert cards:', cardError);
            } else {
              processedCards.push(...cardResults);
              console.log(`✅ Batch inserted ${cardResults.length} cards`);
            }
          }

          // Batch insert variants
          if (variantBatches.length > 0) {
            const { error: variantError } = await supabase
              .from('catalog_v2.variants')
              .upsert(variantBatches, {
                onConflict: 'game,provider_id',
                ignoreDuplicates: false
              });

            if (variantError) {
              console.error('❌ Failed to batch insert variants:', variantError);
            } else {
              processedVariants.push(...variantBatches);
              console.log(`✅ Batch inserted ${variantBatches.length} variants`);
            }
          }

          return cardResults;
        },
        {
          batchSize: dbBatchSize,
          maxConcurrency: syncManager.getConfig('parallel_set_count', 3),
          onProgress: async (processedCount, total) => {
            processed = processedCount;
            
            // Update progress less frequently for better performance
            if (processedCount % progressInterval === 0 || processedCount === total) {
              await syncManager.updateProgress(jobId!, processedCount, total);
            }
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
      sync_type: 'cards',
      total: processedCards.length,
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
      set_id: setId,
      premium_settings: {
        batch_size_cards: syncManager.getConfig('batch_size_cards', 200),
        db_batch_size: dbBatchSize,
        parallel_workers: syncManager.getConfig('parallel_set_count', 3)
      }
    };

    // Complete the job with performance tracking
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 PREMIUM cards sync completed for ${game} set ${setId}!`);
    console.log(`📊 Processed ${processedCards.length} cards and ${processedVariants.length} variants in ${duration}ms`);
    console.log(`📡 Made ${requestCount} API requests`);
    console.log(`⚡ Performance: ${(processedCards.length / (duration / 1000)).toFixed(1)} cards/sec`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedCards.length} cards for set ${setId} with premium optimizations`,
        {
          game,
          set_id: setId,
          cards: processedCards.length,
          variants: processedVariants.length,
          duration_ms: duration,
          api_requests: requestCount,
          performance: `${(processedCards.length / (duration / 1000)).toFixed(1)} cards/sec`
        }
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error(`💥 Premium cards sync failed for ${game} set ${setId}:`, error);

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
        `Premium cards sync failed for ${game} set ${setId}`,
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