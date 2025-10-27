import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { storeKey } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert store key to proper format for settings lookup
    const settingsKey = storeKey.toUpperCase().replace(/_/g, '_');
    
    // Fetch store credentials from system_settings
    const { data: domainSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${settingsKey}_STORE_DOMAIN`)
      .single();
    
    const { data: tokenSetting } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', `SHOPIFY_${settingsKey}_ACCESS_TOKEN`)
      .single();
    
    const domain = domainSetting?.key_value;
    const token = tokenSetting?.key_value;

    if (!domain || !token) {
      console.error(`Missing credentials for ${storeKey}`, {
        hasDomain: !!domain,
        hasToken: !!token,
        lookupKey: `SHOPIFY_${settingsKey}_*`
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing Shopify credentials',
          details: `Store: ${storeKey} - Domain: ${!!domain}, Token: ${!!token}`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch webhooks from Shopify Admin API
    const response = await fetch(`https://${domain}/admin/api/2024-07/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Shopify API error for ${storeKey}:`, response.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: `Shopify API error: ${response.status}`,
          details: errorText
        }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    
    return new Response(
      JSON.stringify({
        ok: true,
        storeKey,
        webhooks: data.webhooks || [],
        count: (data.webhooks || []).length
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error checking webhooks:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});