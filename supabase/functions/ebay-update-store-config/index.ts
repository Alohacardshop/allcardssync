import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { store_key, updates } = await req.json();

    if (!store_key) {
      throw new Error('store_key is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Whitelist of allowed fields to update
    const allowedFields = [
      'default_fulfillment_policy_id',
      'default_payment_policy_id',
      'default_return_policy_id',
      'default_category_id',
      'default_condition_id',
      'title_template',
      'description_template',
      'sync_enabled',
      'dry_run_mode',
      'sync_mode',
      'is_active',
      'price_markup_percent',
    ];

    // Filter updates to only allowed fields
    const safeUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates || {})) {
      if (allowedFields.includes(key)) {
        safeUpdates[key] = value;
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    // Add updated_at
    safeUpdates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('ebay_store_config')
      .update(safeUpdates)
      .eq('store_key', store_key)
      .select()
      .single();

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      data,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error updating store config:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
