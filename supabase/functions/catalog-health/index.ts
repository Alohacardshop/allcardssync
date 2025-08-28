import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logStructured } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MONITORED_GAMES = ['pokemon', 'pokemon-japan', 'magic-the-gathering'];

interface HealthCheckResult {
  game: string;
  sets_count: number;
  cards_count: number;
  pending_count: number;
  healthy: boolean;
  issues: string[];
}

async function performHealthCheck(): Promise<{
  overall_healthy: boolean;
  results: HealthCheckResult[];
}> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const results: HealthCheckResult[] = [];
  let overallHealthy = true;

  for (const game of MONITORED_GAMES) {
    try {
      // Get catalog stats for this game
      const { data: statsData, error } = await supabase
        .rpc('catalog_v2_stats', { game_in: game });

      if (error) {
        logStructured('ERROR', 'Failed to get stats', { game, error: error.message });
        continue;
      }

      const stats = statsData?.[0] || {};
      const sets_count = stats.sets_count || 0;
      const cards_count = stats.cards_count || 0;
      const pending_count = stats.pending_count || 0;

      const issues: string[] = [];
      let healthy = true;

      // Health check criteria
      if (sets_count > 0 && cards_count === 0) {
        issues.push('Sets exist but no cards found');
        healthy = false;
      }

      if (sets_count > 0 && pending_count / sets_count > 0.5) {
        issues.push(`High pending ratio: ${pending_count}/${sets_count} (${Math.round(pending_count/sets_count*100)}%)`);
        healthy = false;
      }

      if (!healthy) {
        overallHealthy = false;
      }

      results.push({
        game,
        sets_count,
        cards_count,
        pending_count,
        healthy,
        issues
      });

      logStructured('INFO', 'Health check result', {
        game,
        sets_count,
        cards_count,
        pending_count,
        healthy,
        issues
      });

    } catch (error: any) {
      logStructured('ERROR', 'Health check failed for game', { 
        game, 
        error: error.message 
      });
      overallHealthy = false;
    }
  }

  // Update system health status
  try {
    await supabase
      .from('system_settings')
      .upsert({
        key_name: 'CATALOG_HEALTH_STATUS',
        key_value: overallHealthy ? 'healthy' : 'unhealthy',
        description: `Catalog health check result. Last checked: ${new Date().toISOString()}`,
        category: 'health',
        is_encrypted: false
      }, { onConflict: 'key_name' });

    // Also store detailed results
    await supabase
      .from('system_settings')
      .upsert({
        key_name: 'CATALOG_HEALTH_DETAILS',
        key_value: JSON.stringify(results),
        description: 'Detailed catalog health check results',
        category: 'health',
        is_encrypted: false
      }, { onConflict: 'key_name' });

  } catch (error: any) {
    logStructured('WARN', 'Failed to update health status', { error: error.message });
  }

  return {
    overall_healthy: overallHealthy,
    results
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const healthCheck = await performHealthCheck();

    return new Response(
      JSON.stringify({
        status: 'success',
        timestamp: new Date().toISOString(),
        ...healthCheck
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    logStructured('ERROR', 'Health check failed', { error: error.message });

    return new Response(
      JSON.stringify({
        status: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});