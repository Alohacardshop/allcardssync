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

    // Since catalog_v2.import_jobs table doesn't exist yet, return empty array
    // This prevents the schema error while maintaining API compatibility
    const jobs: any[] = [];

    return new Response(JSON.stringify(jobs), {
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