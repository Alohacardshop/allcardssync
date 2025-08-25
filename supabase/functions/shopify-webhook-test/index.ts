import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shopify-topic, x-shopify-hmac-sha256",
};

function toBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { sku, quantity } = await req.json();
    if (!sku || !quantity) throw new Error("Missing sku or quantity");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get webhook secret from system_settings table
    const { data: webhookSetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'SHOPIFY_WEBHOOK_SECRET',
        fallbackSecretName: 'SHOPIFY_WEBHOOK_SECRET'
      }
    });

    const SHOPIFY_WEBHOOK_SECRET = webhookSetting?.value;
    if (!SHOPIFY_WEBHOOK_SECRET) throw new Error("Webhook secret not set");

    const body = JSON.stringify({ line_items: [{ sku, quantity: Number(quantity) }] });

    // Compute HMAC-SHA256 of raw body with secret
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(SHOPIFY_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const hmacHeader = toBase64(new Uint8Array(signature));

    const url = `${SUPABASE_URL}/functions/v1/shopify-webhook`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-shopify-topic": "orders/create",
        "x-shopify-hmac-sha256": hmacHeader,
      },
      body,
    });

    const data = await res.json();

    if (!res.ok) throw new Error(JSON.stringify(data));

    return new Response(JSON.stringify({ ok: true, webhookResponse: data }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("shopify-webhook-test error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
