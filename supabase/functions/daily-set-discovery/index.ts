import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Games to discover sets for daily
const GAMES_TO_DISCOVER = [
  'pokemon',
  'pokemon-japan', 
  'magic-the-gathering'
]

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log(`[${new Date().toISOString()}] Daily set discovery started`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Call discover-sets function for all games
    const results = []
    
    for (const game of GAMES_TO_DISCOVER) {
      try {
        console.log(`Discovering sets for ${game}...`)
        
        const { data, error } = await supabase.functions.invoke('discover-sets', {
          body: { games: [game] }
        })
        
        if (error) {
          console.error(`Error discovering sets for ${game}:`, error)
          results.push({ game, status: 'error', error: error.message })
        } else {
          console.log(`✅ ${game}: discovered sets successfully`)
          results.push({ game, status: 'success', data })
        }
        
        // Small delay between games
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error: any) {
        console.error(`❌ Error processing ${game}:`, error.message)
        results.push({ game, status: 'error', error: error.message })
      }
    }

    const responseData = {
      status: 'completed',
      games: GAMES_TO_DISCOVER,
      results,
      timestamp: new Date().toISOString(),
      summary: {
        total: GAMES_TO_DISCOVER.length,
        success: results.filter(r => r.status === 'success').length,
        errors: results.filter(r => r.status === 'error').length
      }
    }

    console.log(`Daily discovery completed:`, responseData.summary)

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('Daily set discovery error:', error)
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