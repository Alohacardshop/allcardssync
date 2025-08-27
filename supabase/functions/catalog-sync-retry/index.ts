import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await req.json();
    const { job_id, game, set_id } = body;

    if (!job_id && (!game || !set_id)) {
      return new Response(JSON.stringify({ 
        error: 'Either job_id or both game and set_id are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let existingJob;
    
    if (job_id) {
      // Find the existing job to retry
      const { data: job, error: jobError } = await sb
        .schema('catalog_v2')
        .from('import_jobs')
        .select('*')
        .eq('id', job_id)
        .single();

      if (jobError) {
        return new Response(JSON.stringify({ error: `Job not found: ${jobError.message}` }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      existingJob = job;
    }

    // For job_id approach, use the existing job's game and set_id
    const targetGame = existingJob?.game || game;
    const targetSetId = existingJob?.set_id || set_id;

    if (!targetGame) {
      return new Response(JSON.stringify({ error: 'Could not determine game' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if there's already an active job for this game/set combination
    const { data: activeJobs } = await sb
      .schema('catalog_v2')
      .from('import_jobs')
      .select('id')
      .eq('source', 'justtcg')
      .eq('game', targetGame)
      .eq('set_id', targetSetId)
      .in('status', ['queued', 'running']);

    if (activeJobs && activeJobs.length > 0) {
      return new Response(JSON.stringify({ 
        message: 'Job already active for this set',
        active_job_id: activeJobs[0].id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Create a fresh job
    const { data: newJob, error: insertError } = await sb
      .schema('catalog_v2')
      .from('import_jobs')
      .insert({
        source: 'justtcg',
        game: targetGame,
        set_id: targetSetId,
        set_code: existingJob?.set_code || null,
        status: 'queued'
      })
      .select()
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: `Failed to create retry job: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Created retry job ${newJob.id} for game=${targetGame}, set_id=${targetSetId}`);

    return new Response(JSON.stringify({ 
      message: 'Retry job created successfully',
      job: newJob
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (e: any) {
    console.error("catalog-sync-retry error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Internal server error",
      stack: e?.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});