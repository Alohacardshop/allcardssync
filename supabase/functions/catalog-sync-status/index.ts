import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = url.searchParams.get('game');
    const limit = Number(url.searchParams.get('limit') ?? 50);

    // Validate game
    if (!game) {
      return new Response(JSON.stringify({ error: 'Missing required parameter: game' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!['mtg', 'pokemon', 'pokemon-japan'].includes(game)) {
      return new Response(JSON.stringify({ error: `Invalid game: ${game}. Must be one of: mtg, pokemon, pokemon-japan` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Query import jobs for the specified game
    const { data, error } = await sb
      .schema('catalog_v2')
      .from('import_jobs')
      .select('id,source,game,set_id,set_code,total,inserted,status,error,started_at,finished_at,created_at,updated_at')
      .eq('game', game)
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 100)); // Cap at 100 for performance

    if (error) {
      console.error('Error fetching import jobs:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify(data ?? []), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (e: any) {
    console.error("catalog-sync-status error:", e);
    return new Response(JSON.stringify({ 
      error: e?.message || "Internal server error",
      stack: e?.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});