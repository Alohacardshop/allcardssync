import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Required webhook topics for the system
const REQUIRED_WEBHOOKS = [
  'inventory_levels/update',
  'inventory_items/update',
  'orders/create',
  'orders/updated',
  'orders/fulfilled',
  'orders/cancelled',
  'refunds/create',
  'products/update',
  'products/delete'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { storeKey, dryRun = false } = await req.json();

    if (!storeKey) {
      return new Response(
        JSON.stringify({ error: 'storeKey is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const settingsKey = storeKey.toUpperCase().replace(/_/g, '_');
    
    // Fetch credentials
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

    const domain = domainSetting?.key_value?.trim();
    const token = tokenSetting?.key_value?.trim();

    if (!domain || !token) {
      return new Response(
        JSON.stringify({ 
          error: 'Missing Shopify credentials',
          storeKey,
          hasDomain: !!domain,
          hasToken: !!token
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Webhook endpoint URL
    const webhookUrl = `${supabaseUrl}/functions/v1/shopify-webhook`;

    // Fetch existing webhooks
    const existingResponse = await fetch(`https://${domain}/admin/api/2024-07/webhooks.json`, {
      headers: {
        'X-Shopify-Access-Token': token,
        'Content-Type': 'application/json'
      }
    });

    if (!existingResponse.ok) {
      throw new Error(`Failed to fetch existing webhooks: ${existingResponse.status}`);
    }

    const existingData = await existingResponse.json();
    const existingWebhooks = existingData.webhooks || [];
    const existingTopics = new Set(existingWebhooks.map((w: any) => w.topic));

    const results = {
      storeKey,
      webhookUrl,
      dryRun,
      existing: existingWebhooks.length,
      required: REQUIRED_WEBHOOKS.length,
      created: [] as string[],
      skipped: [] as string[],
      errors: [] as string[]
    };

    // Register missing webhooks
    for (const topic of REQUIRED_WEBHOOKS) {
      if (existingTopics.has(topic)) {
        results.skipped.push(topic);
        console.log(`✓ Webhook already exists: ${topic}`);
        continue;
      }

      if (dryRun) {
        results.created.push(`${topic} (dry-run)`);
        console.log(`[DRY RUN] Would create webhook: ${topic}`);
        continue;
      }

      try {
        const createResponse = await fetch(`https://${domain}/admin/api/2024-07/webhooks.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            webhook: {
              topic,
              address: webhookUrl,
              format: 'json'
            }
          })
        });

        if (createResponse.ok) {
          results.created.push(topic);
          console.log(`✓ Created webhook: ${topic}`);
        } else {
          const errorText = await createResponse.text();
          results.errors.push(`${topic}: ${errorText}`);
          console.error(`✗ Failed to create webhook ${topic}:`, errorText);
        }

        // Rate limiting protection
        await new Promise(resolve => setTimeout(resolve, 500));

      } catch (error) {
        results.errors.push(`${topic}: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`✗ Error creating webhook ${topic}:`, error);
      }
    }

    return new Response(
      JSON.stringify(results),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error registering webhooks:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
