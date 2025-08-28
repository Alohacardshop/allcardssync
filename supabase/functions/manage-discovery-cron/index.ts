import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'status'
    
    let result: string
    
    if (action === 'enable') {
      // Enable daily discovery at 2 AM UTC
      const { error } = await supabase.rpc('manage_justtcg_cron_jobs', { action: 'enable' })
      
      if (error) {
        throw error
      }
      
      result = 'Daily set discovery cron job enabled (runs at 2 AM UTC daily)'
      
    } else if (action === 'disable') {
      // Disable cron jobs
      const { error } = await supabase.rpc('manage_justtcg_cron_jobs', { action: 'disable' })
      
      if (error) {
        throw error
      }
      
      result = 'Daily set discovery cron job disabled'
      
    } else {
      // Get status
      const { data, error } = await supabase.rpc('manage_justtcg_cron_jobs', { action: 'status' })
      
      if (error) {
        throw error
      }
      
      result = data || 'No cron jobs found'
    }

    return new Response(JSON.stringify({ 
      status: 'success',
      action,
      result,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('Manage discovery cron error:', error)
    return new Response(
      JSON.stringify({ 
        status: 'error', 
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})