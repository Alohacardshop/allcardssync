import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-shopify-hmac-sha256, x-shopify-topic",
};

async function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string | undefined) {
  if (!hmacHeader || !secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const digestBytes = new Uint8Array(sig);
  const headerBytes = Uint8Array.from(atob(hmacHeader), (c) => c.charCodeAt(0));
  if (digestBytes.length !== headerBytes.length) return false;
  let out = 0;
  for (let i = 0; i < digestBytes.length; i++) out |= digestBytes[i] ^ headerBytes[i];
  return out === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Get webhook secret from system_settings table
    const { data: webhookSetting } = await supabase.functions.invoke('get-system-setting', {
      body: { 
        keyName: 'SHOPIFY_WEBHOOK_SECRET',
        fallbackSecretName: 'SHOPIFY_WEBHOOK_SECRET'
      }
    });

    const SHOPIFY_WEBHOOK_SECRET = webhookSetting?.value;
    const topic = req.headers.get("x-shopify-topic");
    const hmac = req.headers.get("x-shopify-hmac-sha256");
    const raw = await req.text();

    const isValid = await verifyHmac(raw, hmac, SHOPIFY_WEBHOOK_SECRET);
    if (!isValid) {
      console.warn("Invalid Shopify webhook HMAC");
      return new Response("Invalid signature", { status: 401, headers: corsHeaders });
    }

    const payload = JSON.parse(raw);

    // Handle order-related updates: decrement quantity by sold amount per SKU
    if (topic && topic.startsWith("orders/")) {
      const lineItems: any[] = payload?.line_items || [];
      for (const li of lineItems) {
        const sku: string | undefined = li?.sku || undefined;
        const qty: number = Number(li?.quantity || 0);
        if (!sku || qty <= 0) continue;

        // Find the earliest pushed, non-deleted, positive-qty item with this SKU
        const { data: rows, error } = await supabase
          .from("intake_items")
          .select("id, quantity")
          .eq("sku", sku)
          .is("deleted_at", null)
          .not("pushed_at", "is", null)
          .gt("quantity", 0)
          .order("created_at", { ascending: true })
          .limit(1);
        if (error) throw error;
        if (!rows || rows.length === 0) continue;

        const row = rows[0] as { id: string; quantity: number };
        const newQty = Math.max(0, Number(row.quantity || 0) - qty);
        const { error: upErr } = await supabase
          .from("intake_items")
          .update({ quantity: newQty })
          .eq("id", row.id);
        if (upErr) throw upErr;
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("shopify-webhook error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
