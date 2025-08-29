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

  const { game, forceResync = false } = await req.json();

  if (!game) {
    return new Response(
      JSON.stringify({ success: false, error: 'Game parameter is required' }),
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
    console.log(`🎴 Starting PREMIUM JustTCG sets sync for game: ${game}`);
    console.log(`🚀 Using premium settings: ${syncManager.getConfig('batch_size_sets', 100)} sets per request`);

    // Check API usage before starting
    await syncManager.checkApiUsageLimits();

    // Check for duplicate work (unless forced)
    if (!forceResync) {
      const duplicateCheck = await syncManager.checkDuplicateSync(game);
      if (duplicateCheck.should_skip) {
        return new Response(
          JSON.stringify({
            success: true,
            message: `Sets sync skipped: ${duplicateCheck.reason}`,
            job_id: null
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        );
      }
    }

    // Create sync job
    jobId = await syncManager.createJob('sets', { game });
    await syncManager.startJob(jobId);

    console.log(`📋 Created premium job ${jobId} for game ${game}`);

    const startTime = Date.now();
    const processedSets: any[] = [];
    const skippedSets: any[] = [];
    let totalSets = 0;
    let processed = 0;

    // Get API game ID (reverse of normalization)
    const apiGameId = Object.entries({
      'mtg': 'magic-the-gathering',
      'pokemon': 'pokemon', 
      'yugioh': 'yu-gi-oh',
      'dbs': 'dragon-ball-super',
      'onepiece': 'one-piece'
    }).find(([normalized, _]) => normalized === game)?.[1] || game;

    const progressInterval = syncManager.getConfig('progress_update_interval_sets', 20);
    const dbBatchSize = syncManager.getConfig('db_batch_size', 50);

    // Fetch sets from API with premium pagination and parallel processing
    for await (const setsPage of justTCGClient.getSets(apiGameId)) {
      totalSets += setsPage.length;
      
      // Update progress with new total
      await syncManager.updateProgress(jobId, processed, totalSets);

      // Process sets using parallel batch processing
      await syncManager.parallelBatchProcess(
        setsPage,
        async (setsBatch) => {
          const setBatchResults: any[] = [];
          
          // Check existing sets in batch for efficiency
          const existingSetIds = setsBatch.map(s => s.id);
          const { data: existingSets } = await supabase
            .from('catalog_v2.sets')
            .select('provider_id, sync_status, card_count, last_synced_at')
            .eq('game', game)
            .in('provider_id', existingSetIds);

          const existingSetMap = new Map(
            existingSets?.map(s => [s.provider_id, s]) || []
          );

          for (const apiSet of setsBatch) {
            try {
              // Check if set already exists and is recently synced
              const existingSet = existingSetMap.get(apiSet.id);

              // Skip if already synced recently (unless forced)
              if (!forceResync && existingSet?.sync_status === 'synced' && existingSet.card_count > 0) {
                const hoursSinceSync = existingSet.last_synced_at 
                  ? (Date.now() - new Date(existingSet.last_synced_at).getTime()) / (1000 * 60 * 60)
                  : Infinity;

                if (hoursSinceSync < 24) {
                  skippedSets.push({
                    id: apiSet.id,
                    name: apiSet.name,
                    reason: `Synced ${Math.round(hoursSinceSync)} hours ago`
                  });
                  continue;
                }
              }

              // Prepare set data for our database
              const setData = {
                set_id: crypto.randomUUID(), // Generate UUID for our internal ID
                game: game,
                provider_id: apiSet.id,
                code: apiSet.id, // Use JustTCG ID as code
                name: apiSet.name,
                sync_status: 'pending',
                justtcg_set_id: apiSet.id,
                justtcg_metadata: {
                  total: apiSet.total,
                  release_date: apiSet.release_date,
                  images: apiSet.images,
                  synced_at: new Date().toISOString()
                }
              };

              setBatchResults.push(setData);
              processedSets.push({
                id: apiSet.id,
                name: apiSet.name,
                game: game,
                total: apiSet.total
              });

            } catch (error) {
              console.error(`❌ Error processing set ${apiSet.id}:`, error);
            }
          }

          // Batch upsert sets for better performance
          if (setBatchResults.length > 0) {
            const { error: setError } = await supabase
              .from('catalog_v2.sets')
              .upsert(setBatchResults, {
                onConflict: 'game,provider_id',
                ignoreDuplicates: false
              });

            if (setError) {
              console.error(`❌ Failed to batch upsert sets:`, setError);
            } else {
              console.log(`✅ Batch processed ${setBatchResults.length} sets`);
            }
          }

          return setBatchResults;
        },
        {
          batchSize: dbBatchSize,
          maxConcurrency: syncManager.getConfig('parallel_set_count', 3),
          onProgress: async (processedCount, total) => {
            processed = processedCount;
            
            // Update progress less frequently for better performance
            if (processedCount % progressInterval === 0 || processedCount === total) {
              await syncManager.updateProgress(jobId!, processedCount, totalSets);
            }
          }
        }
      );

      // Memory cleanup after each page
      if (global.gc) {
        global.gc();
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const requestCount = justTCGClient.getRequestCount();

    const results = {
      game: game,
      total_sets: totalSets,
      processed_sets: processedSets.length,
      skipped_sets: skippedSets.length,
      sync_type: 'sets',
      total: processedSets.length,
      sets: processedSets,
      skipped: skippedSets
    };

    const metrics = {
      duration_ms: duration,
      api_requests: requestCount,
      sets_per_second: processedSets.length / (duration / 1000),
      start_time: startTime,
      end_time: endTime,
      game: game,
      premium_settings: {
        batch_size_sets: syncManager.getConfig('batch_size_sets', 100),
        db_batch_size: dbBatchSize,
        parallel_workers: syncManager.getConfig('parallel_set_count', 3),
        progress_interval: progressInterval
      }
    };

    // Complete the job with performance tracking
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 PREMIUM sets sync completed for ${game}!`);
    console.log(`📊 Processed ${processedSets.length}/${totalSets} sets, skipped ${skippedSets.length}`);
    console.log(`📡 Made ${requestCount} API requests in ${duration}ms`);
    console.log(`⚡ Performance: ${(processedSets.length / (duration / 1000)).toFixed(1)} sets/sec`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedSets.length} sets for ${game} with premium optimizations`,
        {
          game,
          total: totalSets,
          processed: processedSets.length,
          skipped: skippedSets.length,
          duration_ms: duration,
          api_requests: requestCount,
          performance: `${(processedSets.length / (duration / 1000)).toFixed(1)} sets/sec`
        }
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error(`💥 Premium sets sync failed for ${game}:`, error);

    if (jobId) {
      await syncManager.completeJob(
        jobId,
        'failed',
        { game },
        { error_type: error.name || 'UnknownError', game },
        error.message
      );
    }

    return new Response(
      JSON.stringify(syncManager.createResult(
        false,
        jobId || 'unknown',
        `Premium sets sync failed for ${game}`,
        { game },
        error.message
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});