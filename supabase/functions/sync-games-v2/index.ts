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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const justTCGApiKey = Deno.env.get('JUSTTCG_API_KEY')!;

  const syncManager = new SyncManager(supabaseUrl, supabaseKey);
  const justTCGClient = new JustTCGClient(justTCGApiKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | undefined;

  try {
    console.log('🎮 Starting JustTCG games sync...');

    // Create sync job
    jobId = await syncManager.createJob('games');
    await syncManager.startJob(jobId);

    console.log(`📋 Created job ${jobId}`);

    // Fetch games from JustTCG API
    const startTime = Date.now();
    const apiGames = await justTCGClient.getGames();
    
    console.log(`📡 Fetched ${apiGames.length} games from API`);

    // Track progress
    await syncManager.updateProgress(jobId, 0, apiGames.length);

    const processedGames: any[] = [];
    let processed = 0;

    for (const apiGame of apiGames) {
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

        // Upsert to games table
        const { error: gameError } = await supabase
          .from('games')
          .upsert(gameData, { 
            onConflict: 'id',
            ignoreDuplicates: false
          });

        if (gameError) {
          console.error(`❌ Failed to upsert game ${apiGame.id}:`, gameError);
        } else {
          processedGames.push({
            id: normalizedSlug,
            justtcg_id: apiGame.id,
            name: apiGame.name,
            active: apiGame.active
          });
          console.log(`✅ Processed game: ${apiGame.name} (${normalizedSlug})`);
        }

        processed++;
        
        // Update progress every 5 games or at the end
        if (processed % 5 === 0 || processed === apiGames.length) {
          await syncManager.updateProgress(jobId, processed, apiGames.length);
        }

      } catch (error) {
        console.error(`❌ Error processing game ${apiGame.id}:`, error);
      }
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    const requestCount = justTCGClient.getRequestCount();

    const results = {
      total_games: apiGames.length,
      processed_games: processedGames.length,
      games: processedGames
    };

    const metrics = {
      duration_ms: duration,
      api_requests: requestCount,
      games_per_second: processedGames.length / (duration / 1000),
      start_time: startTime,
      end_time: endTime
    };

    // Complete the job
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 Games sync completed successfully!`);
    console.log(`📊 Processed ${processedGames.length}/${apiGames.length} games in ${duration}ms`);
    console.log(`📡 Made ${requestCount} API requests`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedGames.length} games`,
        {
          total: apiGames.length,
          processed: processedGames.length,
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
    console.error('💥 Games sync failed:', error);

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
        'Games sync failed',
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