import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-token',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check for the shared cron token
    const cronToken = req.headers.get('x-cron-token');
    const expectedToken = Deno.env.get('CRON_SHARED_TOKEN');
    
    if (!cronToken || !expectedToken || cronToken !== expectedToken) {
      console.log('🔒 Unauthorized cron proxy call - invalid or missing token');
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid cron token' }), 
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request parameters
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'pokemon';
    const maxConcurrency = parseInt(url.searchParams.get('maxConcurrency') || '3');
    const maxBatches = parseInt(url.searchParams.get('maxBatches') || '10');
    const batchSize = parseInt(url.searchParams.get('batchSize') || '5');

    console.log(`🤖 Cron proxy: Starting turbo worker for mode=${mode}`);

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Call catalog-turbo-worker with service role authorization
    const { data, error } = await supabase.functions.invoke('catalog-turbo-worker', {
      body: {}, // Empty body, function uses query params
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
      }
    });

    if (error) {
      console.error(`❌ Cron proxy: Failed to invoke turbo worker for mode=${mode}:`, error);
      return new Response(
        JSON.stringify({ error: `Failed to invoke turbo worker: ${error.message}` }), 
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`✅ Cron proxy: Successfully triggered turbo worker for mode=${mode}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        mode, 
        message: `Turbo worker started for ${mode}`,
        params: { maxConcurrency, maxBatches, batchSize }
      }), 
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('❌ Cron proxy error:', error);
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});