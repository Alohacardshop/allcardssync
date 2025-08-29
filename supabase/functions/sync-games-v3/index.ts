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
    console.log('🎮 Starting PREMIUM JustTCG games sync...');
    console.log('🚀 Using premium API settings for maximum performance');

    // Check API usage before starting
    await syncManager.checkApiUsageLimits();

    // Create sync job
    jobId = await syncManager.createJob('games');
    await syncManager.startJob(jobId);

    console.log(`📋 Created premium job ${jobId}`);

    // Fetch games from JustTCG API
    const startTime = Date.now();
    const apiGames = await justTCGClient.getGames();
    
    console.log(`📡 Fetched ${apiGames.length} games from API with premium client`);

    // Track progress
    await syncManager.updateProgress(jobId, 0, apiGames.length);

    const processedGames: any[] = [];
    let processed = 0;

    const dbBatchSize = syncManager.getConfig('db_batch_size', 50);

    // Process games in optimized batches
    await syncManager.parallelBatchProcess(
      apiGames,
      async (gamesBatch) => {
        const gameBatchResults: any[] = [];
        
        for (const apiGame of gamesBatch) {
          try {
            // Normalize game slug for our system
            const normalizedSlug = justTCGClient.normalizeGameSlug(apiGame.id);
            
            // Prepare game data
            const gameData = {
              id: normalizedSlug,
              name: apiGame.name,
              raw: {
                justtcg_id: apiGame.id,
                justtcg_name: apiGame.name,
                active: apiGame.active,
                synced_at: new Date().toISOString()
              }
            };

            gameBatchResults.push(gameData);
            processedGames.push({
              id: normalizedSlug,
              justtcg_id: apiGame.id,
              name: apiGame.name,
              active: apiGame.active
            });

          } catch (error) {
            console.error(`❌ Error processing game ${apiGame.id}:`, error);
          }
        }

        // Batch upsert games for better performance
        if (gameBatchResults.length > 0) {
          const { error: gameError } = await supabase
            .from('games')
            .upsert(gameBatchResults, { 
              onConflict: 'id',
              ignoreDuplicates: false
            });

          if (gameError) {
            console.error(`❌ Failed to batch upsert games:`, gameError);
          } else {
            console.log(`✅ Batch processed ${gameBatchResults.length} games`);
          }
        }

        return gameBatchResults;
      },
      {
        batchSize: dbBatchSize,
        maxConcurrency: 2, // Games are fewer, less concurrency needed
        onProgress: async (processedCount, total) => {
          processed = processedCount;
          await syncManager.updateProgress(jobId!, processedCount, total);
        }
      }
    );

    const endTime = Date.now();
    const duration = endTime - startTime;
    const requestCount = justTCGClient.getRequestCount();

    const results = {
      total_games: apiGames.length,
      processed_games: processedGames.length,
      sync_type: 'games',
      total: processedGames.length,
      games: processedGames
    };

    const metrics = {
      duration_ms: duration,
      api_requests: requestCount,
      games_per_second: processedGames.length / (duration / 1000),
      start_time: startTime,
      end_time: endTime,
      premium_settings: {
        db_batch_size: dbBatchSize,
        api_timeout: syncManager.getConfig('api_timeout_ms', 60000),
        rate_limit: syncManager.getConfig('api_rate_limit_ms', 150)
      }
    };

    // Complete the job with performance tracking
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 PREMIUM games sync completed successfully!`);
    console.log(`📊 Processed ${processedGames.length}/${apiGames.length} games in ${duration}ms`);
    console.log(`📡 Made ${requestCount} API requests`);
    console.log(`⚡ Performance: ${(processedGames.length / (duration / 1000)).toFixed(1)} games/sec`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedGames.length} games with premium optimizations`,
        {
          total: apiGames.length,
          processed: processedGames.length,
          duration_ms: duration,
          api_requests: requestCount,
          performance: `${(processedGames.length / (duration / 1000)).toFixed(1)} games/sec`
        }
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('💥 Premium games sync failed:', error);

    if (jobId) {
      await syncManager.completeJob(
        jobId,
        'failed',
        {},
        { error_type: error.name || 'UnknownError' },
        error.message
      );
    }

    return new Response(
      JSON.stringify(syncManager.createResult(
        false,
        jobId || 'unknown',
        'Premium games sync failed',
        undefined,
        error.message
      )),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});