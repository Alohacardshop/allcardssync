import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logStructured as log } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GAMES = ['pokemon', 'pokemon-japan', 'magic-the-gathering'];

export async function runHealthCheck() {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  
  let overallHealthy = true;
  const results = [];
  
  for (const game of GAMES) {
    const { data, error } = await sb.rpc('catalog_v2_stats', { game_in: game });
    if (error) { 
      log('ERROR', 'health:stats-failed', { game, error: error.message }); 
      continue; 
    }
    
    const r = (data?.[0] || {}) as any;
    const sets = r.sets_count ?? 0;
    const cards = r.cards_count ?? 0; 
    const pending = r.pending_count ?? 0;
    
    // Health criteria: sets > 0 && cards == 0, or pending/sets > 0.5
    const unhealthy = (sets > 0 && cards === 0) || (sets > 0 && pending/sets > 0.5);
    
    if (unhealthy) overallHealthy = false;
    
    log('INFO', 'health:stats', { game, sets, cards, pending, unhealthy });
    results.push({ game, sets, cards, pending, unhealthy });
  }
  
  // Update system setting for admin banner
  await sb
    .from('system_settings')
    .upsert({
      key_name: 'CATALOG_HEALTH_STATUS',
      key_value: overallHealthy ? 'healthy' : 'unhealthy',
      description: 'Overall catalog health status',
      category: 'system'
    }, { onConflict: 'key_name' });
    
  return { ok: true, healthy: overallHealthy, results };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const result = await runHealthCheck();
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    log('ERROR', 'health-check failed', { error: error.message });
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error.message 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});