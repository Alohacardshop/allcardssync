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

  const syncManager = new SyncManager(supabaseUrl, supabaseKey);
  const justTCGClient = new JustTCGClient(justTCGApiKey);
  const supabase = createClient(supabaseUrl, supabaseKey);

  let jobId: string | undefined;

  try {
    console.log(`🎴 Starting JustTCG sets sync for game: ${game}`);

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

    console.log(`📋 Created job ${jobId} for game ${game}`);

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

    // Fetch sets from API with pagination
    for await (const setsPage of justTCGClient.getSets(apiGameId)) {
      totalSets += setsPage.length;
      
      // Update progress with new total
      await syncManager.updateProgress(jobId, processed, totalSets);

      for (const apiSet of setsPage) {
        try {
          // Check if set already exists and is recently synced
          const { data: existingSet } = await supabase
            .from('catalog_v2.sets')
            .select('sync_status, card_count, last_synced_at')
            .eq('game', game)
            .eq('provider_id', apiSet.id)
            .single();

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
              processed++;
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

          // Upsert set to database
          const { error: setError } = await supabase
            .from('catalog_v2.sets')
            .upsert(setData, {
              onConflict: 'game,provider_id',
              ignoreDuplicates: false
            });

          if (setError) {
            console.error(`❌ Failed to upsert set ${apiSet.id}:`, setError);
          } else {
            processedSets.push({
              id: apiSet.id,
              name: apiSet.name,
              game: game,
              total: apiSet.total
            });
            console.log(`✅ Processed set: ${apiSet.name} (${apiSet.id})`);
          }

        } catch (error) {
          console.error(`❌ Error processing set ${apiSet.id}:`, error);
        }

        processed++;
        
        // Update progress every 10 sets
        if (processed % 10 === 0) {
          await syncManager.updateProgress(jobId, processed, totalSets);
        }
      }

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
      sets: processedSets,
      skipped: skippedSets
    };

    const metrics = {
      duration_ms: duration,
      api_requests: requestCount,
      sets_per_second: processedSets.length / (duration / 1000),
      start_time: startTime,
      end_time: endTime,
      game: game
    };

    // Complete the job
    await syncManager.completeJob(jobId, 'completed', results, metrics);

    console.log(`🎉 Sets sync completed for ${game}!`);
    console.log(`📊 Processed ${processedSets.length}/${totalSets} sets, skipped ${skippedSets.length}`);
    console.log(`📡 Made ${requestCount} API requests in ${duration}ms`);

    return new Response(
      JSON.stringify(syncManager.createResult(
        true,
        jobId,
        `Successfully synced ${processedSets.length} sets for ${game}`,
        {
          game,
          total: totalSets,
          processed: processedSets.length,
          skipped: skippedSets.length,
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
    console.error(`💥 Sets sync failed for ${game}:`, error);

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
        `Sets sync failed for ${game}`,
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