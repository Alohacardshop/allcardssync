
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { storeKey } = await req.json();
    if (!storeKey) throw new Error("Missing storeKey parameter");

    const storeKeyUpper = storeKey.toUpperCase();

    // Get store-specific credentials from system_settings table
    const { data: domainData } = await supabase
      .from("system_settings")
      .select("key_value")
      .eq("key_name", `SHOPIFY_${storeKeyUpper}_STORE_DOMAIN`)
      .single();

    const { data: tokenData } = await supabase
      .from("system_settings")
      .select("key_value")
      .eq("key_name", `SHOPIFY_${storeKeyUpper}_ACCESS_TOKEN`)
      .single();

    const SHOPIFY_STORE_DOMAIN = domainData?.key_value;
    const SHOPIFY_ADMIN_ACCESS_TOKEN = tokenData?.key_value;

    if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
      throw new Error(`Shopify configuration not found for store '${storeKey}'. Please configure credentials in Admin > Shopify Config.`);
    }

    // Fetch locations from Shopify
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/locations.json`, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    
    return new Response(
      JSON.stringify({ ok: true, locations: data.locations || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shopify-locations error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
