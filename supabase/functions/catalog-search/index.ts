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
    console.log("Catalog search request received:", req.url);
    
    const u = new URL(req.url);
    const game = (u.searchParams.get("game")||"").trim();
    const name = (u.searchParams.get("name")||"").trim();
    const number = (u.searchParams.get("number")||"").trim();
    const limit = Math.min(10, Math.max(1, Number(u.searchParams.get("limit")||"5")));

    console.log("Search parameters:", { game, name, number, limit });

    if (!game || name.length < 2) {
      console.log("Invalid parameters - returning empty result");
      return new Response(JSON.stringify({ data: [] }), { 
        headers: { ...corsHeaders, "Content-Type":"application/json" }
      });
    }

    let q = sb.schema("catalog_v2").from("cards")
      .select("id,game,name,number,images,tcgplayer_product_id,set:sets(name)")
      .eq("game", game)
      .limit(limit);

    if (number) {
      console.log("Searching with name and number filters");
      q = q.ilike("name", `%${name}%`).eq("number", number);
    } else {
      console.log("Searching with name filter only");
      q = q.ilike("name", `%${name}%`);
    }

    const { data, error } = await q;
    
    if (error) {
      console.error("Database query error:", error);
      throw error;
    }

    console.log(`Found ${data?.length || 0} results`);
    
    return new Response(JSON.stringify({ data }), { 
      headers: { ...corsHeaders, "Content-Type":"application/json" }
    });
  } catch (e: any) {
    console.error("Catalog search error:", e);
    return new Response(JSON.stringify({ error: e.message || "error" }), { 
      status: 500, 
      headers: { ...corsHeaders, "Content-Type":"application/json" }
    });
  }
});