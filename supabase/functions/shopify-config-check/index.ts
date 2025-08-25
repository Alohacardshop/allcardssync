import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Read storeKey from request (optional)
    let storeKey: string | null = null;
    try {
      const body = await req.json();
      storeKey = (body?.storeKey ?? null) as string | null;
    } catch (_) {
      // no body provided
    }

    const upper = storeKey ? storeKey.toUpperCase() : null;

    // Decide which key names to look up
    const DOMAIN_KEY = upper ? `SHOPIFY_${upper}_STORE_DOMAIN` : 'SHOPIFY_STORE_DOMAIN';
    const TOKEN_KEY = upper ? `SHOPIFY_${upper}_ACCESS_TOKEN` : 'SHOPIFY_ADMIN_ACCESS_TOKEN';
    const WEBHOOK_KEY = upper ? `SHOPIFY_${upper}_WEBHOOK_SECRET` : 'SHOPIFY_WEBHOOK_SECRET';

    // Load from system_settings
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('key_name,key_value')
      .in('key_name', [DOMAIN_KEY, TOKEN_KEY, WEBHOOK_KEY]);

    if (settingsError) throw settingsError;

    const getVal = (k: string) => settings?.find(s => s.key_name === k)?.key_value || null;

    const SHOPIFY_STORE_DOMAIN = getVal(DOMAIN_KEY);
    const SHOPIFY_ADMIN_ACCESS_TOKEN = getVal(TOKEN_KEY);
    const SHOPIFY_WEBHOOK_SECRET = getVal(WEBHOOK_KEY);

    const hasDomain = Boolean(SHOPIFY_STORE_DOMAIN);
    const hasAdminToken = Boolean(SHOPIFY_ADMIN_ACCESS_TOKEN);
    const hasWebhookSecret = Boolean(SHOPIFY_WEBHOOK_SECRET);

    let shop: any = null;
    let locations: any[] = [];

    if (hasDomain && hasAdminToken) {
      const api = async (path: string) => {
        const res = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/2024-07${path}`, {
          headers: { "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN!, "Content-Type": "application/json" },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(JSON.stringify(json));
        return json;
      };
      try {
        const shopRes = await api(`/shop.json`);
        shop = shopRes.shop || null;
      } catch (e) {
        shop = null;
      }
      try {
        const locRes = await api(`/locations.json`);
        locations = locRes.locations || [];
      } catch (e) {
        locations = [];
      }
    }

    return new Response(
      JSON.stringify({
        storeDomain: SHOPIFY_STORE_DOMAIN || null,
        hasAdminToken,
        hasWebhookSecret,
        shop,
        locations,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("shopify-config-check error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
