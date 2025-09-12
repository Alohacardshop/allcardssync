import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface HealthCheck {
  service: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime?: number;
  details?: Record<string, any>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const justTcgApiKey = Deno.env.get('JUSTTCG_API_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const checks: HealthCheck[] = []
    
    // Check JustTCG API
    const apiStart = Date.now()
    try {
      const response = await fetch('https://api.justtcg.com/v1/games', {
        headers: { 'x-api-key': justTcgApiKey },
        signal: AbortSignal.timeout(5000)
      })
      
      const apiResponseTime = Date.now() - apiStart
      checks.push({
        service: 'justtcg_api',
        status: response.ok ? 'healthy' : 'degraded',
        responseTime: apiResponseTime,
        details: {
          status_code: response.status,
          rate_limit_remaining: response.headers.get('x-ratelimit-remaining'),
          rate_limit_reset: response.headers.get('x-ratelimit-reset')
        }
      })
    } catch (error) {
      checks.push({
        service: 'justtcg_api',
        status: 'down',
        responseTime: Date.now() - apiStart,
        details: { error: error.message }
      })
    }

    // Check Database
    const dbStart = Date.now()
    try {
      const { error } = await supabase
        .from('intake_items')
        .select('id')
        .limit(1)
      
      const dbResponseTime = Date.now() - dbStart
      checks.push({
        service: 'database',
        status: error ? 'degraded' : 'healthy',
        responseTime: dbResponseTime,
        details: error ? { error: error.message } : {}
      })
    } catch (error) {
      checks.push({
        service: 'database',
        status: 'down',
        responseTime: Date.now() - dbStart,
        details: { error: error.message }
      })
    }

    // Check System Memory (approximate)
    const memoryUsage = (Deno.memoryUsage?.() || { heapUsed: 0, heapTotal: 0 })
    const memoryUsageMB = Math.round(memoryUsage.heapUsed / 1024 / 1024)
    const memoryTotalMB = Math.round(memoryUsage.heapTotal / 1024 / 1024)
    
    checks.push({
      service: 'system',
      status: memoryUsageMB > 400 ? 'degraded' : 'healthy',
      details: {
        memory_used_mb: memoryUsageMB,
        memory_total_mb: memoryTotalMB,
        memory_usage_percent: Math.round((memoryUsageMB / memoryTotalMB) * 100)
      }
    })

    // Log health checks to system logs
    try {
      for (const check of checks) {
        await supabase.rpc('add_system_log', {
          level_in: check.status === 'healthy' ? 'info' : 'warning',
          message_in: `Health check for ${check.service}: ${check.status}`,
          context_in: {
            service: check.service,
            status: check.status,
            response_time_ms: check.responseTime || null,
            details: check.details || {}
          },
          source_in: 'health-monitor'
        })
      }
    } catch (logError) {
      console.warn('Failed to log health checks:', logError.message)
    }

    // Calculate overall health
    const healthyCount = checks.filter(c => c.status === 'healthy').length
    const totalCount = checks.length
    const overallHealth = healthyCount === totalCount ? 'healthy' : 
                         healthyCount > 0 ? 'degraded' : 'down'

    return new Response(JSON.stringify({
      overall_status: overallHealth,
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        healthy: healthyCount,
        total: totalCount,
        uptime_percentage: Math.round((healthyCount / totalCount) * 100)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Health check failed:', error)
    return new Response(JSON.stringify({
      overall_status: 'down',
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})