import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

console.log('CGC function starting up...', {
  timestamp: new Date().toISOString(),
  env_has_username: !!Deno.env.get('CGC_USERNAME'),
  env_has_password: !!Deno.env.get('CGC_PASSWORD')
});

serve(async (req) => {
  console.log('CGC function invoked:', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Returning CORS preflight response');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Simple test response to verify function is working
    return new Response(JSON.stringify({
      ok: false,
      error: 'CGC function is deployed but not fully implemented yet',
      test: true,
      timestamp: new Date().toISOString()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('CGC function error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: 'Function error: ' + (error instanceof Error ? error.message : 'Unknown error')
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});