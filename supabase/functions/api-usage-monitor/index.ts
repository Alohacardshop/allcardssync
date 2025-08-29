import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('📊 Starting API usage monitoring check...');

    // Get current API usage statistics
    const { data: usageStats, error: statsError } = await supabase
      .rpc('sync_v3.get_api_usage_stats');

    if (statsError) {
      throw new Error(`Failed to get usage stats: ${statsError.message}`);
    }

    console.log('Current API Usage:', JSON.stringify(usageStats, null, 2));

    // Get usage alert threshold from config
    const { data: configData } = await supabase
      .from('sync_v3.config')
      .select('value')
      .eq('key', 'usage_alert_threshold')
      .single();

    const alertThreshold = configData?.value ? parseFloat(configData.value) : 0.8;
    const alerts: string[] = [];

    // Check hourly usage
    if (usageStats.current_hour.percentage > alertThreshold * 100) {
      const alert = `🚨 Hourly API limit warning: ${usageStats.current_hour.percentage}% used (${usageStats.current_hour.requests}/${usageStats.current_hour.limit})`;
      alerts.push(alert);
      console.warn(alert);
    }

    // Check daily usage
    if (usageStats.daily.percentage > alertThreshold * 100) {
      const alert = `🚨 Daily API limit warning: ${usageStats.daily.percentage}% used (${usageStats.daily.requests}/${usageStats.daily.limit})`;
      alerts.push(alert);
      console.warn(alert);
    }

    // Check monthly usage (less critical for premium plan)
    if (usageStats.monthly.percentage > 50) {
      const alert = `ℹ️  Monthly API usage: ${usageStats.monthly.percentage}% used (${usageStats.monthly.requests}/${usageStats.monthly.limit})`;
      alerts.push(alert);
      console.log(alert);
    }

    // Get recent sync performance for context
    const { data: recentJobs } = await supabase
      .from('sync_v3.jobs')
      .select('id, job_type, metrics, completed_at')
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(5);

    const performanceStats = recentJobs?.map(job => ({
      id: job.id,
      type: job.job_type,
      performance: job.metrics?.performance,
      completed_at: job.completed_at
    })) || [];

    // Calculate average performance improvement
    const validPerformance = performanceStats
      .filter(p => p.performance?.improvement?.speedMultiplier)
      .map(p => p.performance.improvement.speedMultiplier);

    const avgImprovement = validPerformance.length > 0 
      ? validPerformance.reduce((a, b) => a + b, 0) / validPerformance.length 
      : 0;

    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      usage_stats: usageStats,
      alerts: alerts,
      alert_threshold_percentage: alertThreshold * 100,
      recent_performance: {
        average_speed_multiplier: avgImprovement.toFixed(2),
        recent_jobs: performanceStats.length,
        performance_description: avgImprovement >= 3 
          ? `🚀 Excellent! ${avgImprovement.toFixed(1)}x faster than baseline`
          : avgImprovement >= 2 
          ? `⚡ Great! ${avgImprovement.toFixed(1)}x faster than baseline`
          : avgImprovement >= 1.5 
          ? `✅ Good! ${avgImprovement.toFixed(1)}x faster than baseline`
          : 'Performance within normal range'
      },
      recommendations: []
    };

    // Add recommendations based on usage
    if (usageStats.current_hour.percentage < 20) {
      response.recommendations.push('💡 Low API usage - consider increasing batch sizes or parallel processing');
    }

    if (alerts.length === 0) {
      response.recommendations.push('✅ API usage is within safe limits');
    }

    if (avgImprovement >= 3) {
      response.recommendations.push('🎉 Premium API optimizations are working excellently!');
    } else if (avgImprovement < 2) {
      response.recommendations.push('🔧 Consider reviewing sync configuration for better performance');
    }

    console.log(`✅ API monitoring completed. Alerts: ${alerts.length}, Avg performance: ${avgImprovement.toFixed(1)}x`);

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('💥 API usage monitoring failed:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});