
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
    console.log(`shopify-locations: Fetching locations for store ${storeKey}`);

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
      console.log(`shopify-locations: Missing configuration for store ${storeKey}`);
      throw new Error(`Shopify configuration not found for store '${storeKey}'. Please configure credentials in Admin > Shopify Config.`);
    }

    // Fetch locations from Shopify
    const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07/locations.json`, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
    });

    console.log(`shopify-locations: Shopify API response status ${response.status} for store ${storeKey}`);

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Shopify API error: ${response.status}`;
      
      // Provide more helpful error messages
      switch (response.status) {
        case 401:
        case 403:
          errorMessage = "Invalid or insufficient permissions for this store's access token";
          break;
        case 404:
          errorMessage = "Invalid store domain";
          break;
        default:
          errorMessage = `Shopify API error: ${response.status} ${text}`;
      }
      
      throw new Error(errorMessage);
    }

    let data;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error("Unexpected Shopify response format");
    }
    
    const locations = data.locations || [];
    console.log(`shopify-locations: Found ${locations.length} locations for store ${storeKey}`);

    // Cache locations in shopify_location_cache table
    for (const loc of locations) {
      const gid = `gid://shopify/Location/${loc.id}`;
      const now = new Date();
      const expires = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours from now
      
      await supabase
        .from("shopify_location_cache")
        .upsert({
          store_key: storeKey,
          location_gid: gid,
          location_id: String(loc.id),
          location_name: loc.name,
          cached_at: now.toISOString(),
          expires_at: expires.toISOString()
        }, { onConflict: 'store_key,location_gid' });
    }
    
    return new Response(
      JSON.stringify({ 
        ok: true, 
        storeKey,
        count: locations.length,
        locations: locations.map((l: any) => ({
          id: l.id,
          gid: `gid://shopify/Location/${l.id}`,
          name: l.name,
          active: l.active,
          address1: l.address1,
          city: l.city
        }))
      }),
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
