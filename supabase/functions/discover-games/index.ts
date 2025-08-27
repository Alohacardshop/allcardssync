import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TokenBucket {
  tokens: number
  lastRefill: number
  capacity: number
  refillRate: number
}

// Global rate limiter: 500 requests per minute (8.33 per second)
const rateLimiter: TokenBucket = {
  tokens: 500,
  lastRefill: Date.now(),
  capacity: 500,
  refillRate: 500 / 60 // tokens per second
}

function checkRateLimit(): boolean {
  const now = Date.now()
  const timePassed = (now - rateLimiter.lastRefill) / 1000
  
  // Add tokens based on time passed
  rateLimiter.tokens = Math.min(
    rateLimiter.capacity,
    rateLimiter.tokens + (timePassed * rateLimiter.refillRate)
  )
  rateLimiter.lastRefill = now
  
  if (rateLimiter.tokens >= 1) {
    rateLimiter.tokens -= 1
    return true
  }
  return false
}

async function getApiKey(): Promise<string> {
  const apiKey = Deno.env.get('JUSTTCG_API_KEY')
  if (!apiKey) {
    throw new Error('JUSTTCG_API_KEY not found in environment')
  }
  return apiKey
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log(`[${new Date().toISOString()}] Discover games request received`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Check rate limit
    if (!checkRateLimit()) {
      throw new Error('Rate limit exceeded. Please wait before making more requests.')
    }

    const apiKey = await getApiKey()
    
    console.log('Calling JustTCG /games API...')
    
    // Call JustTCG API
    const response = await fetch('https://api.justtcg.com/v1/games', {
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`JustTCG API error: ${response.status} ${response.statusText}`)
    }

    const raw = await response.json()
    console.log('Raw API response keys:', Object.keys(raw || {}))
    
    // Robust parsing - support common envelope formats
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
        ? raw.data
        : Array.isArray(raw?.games)
          ? raw.games
          : Array.isArray(raw?.results)
            ? raw.results
            : []

    console.log(`Discovered ${arr.length} games from JustTCG API`)

    // Map to the exact API shape
    type APIGame = {
      id: string;
      name: string;
      game_id?: string;
      cards_count?: number;
      sets_count?: number;
      [k: string]: unknown;
    };

    const data = arr.map((g: APIGame) => ({
      id: String(g.id),
      name: String(g.name ?? ""),
      game_id: String(g.game_id ?? g.id ?? ""),
      cards_count: Number(g.cards_count ?? 0),
      sets_count: Number(g.sets_count ?? 0),
      raw: g,
    }))

    // Upsert games into database
    if (data.length > 0) {
      const gamesData = data.map(({ raw, ...rest }) => ({
        id: rest.id,
        name: rest.name,
        raw: raw,
        discovered_at: new Date().toISOString()
      }))

      const { error } = await supabase
        .from('games')
        .upsert(gamesData, { 
          onConflict: 'id',
          ignoreDuplicates: false 
        })
      
      if (error) {
        console.error('Error upserting games:', error)
        throw error
      }

      console.log(`Upserted ${data.length} games into database`)
    }

    // Build metadata with diagnostics
    const metadata = {
      count: data.length,
      topLevelKeys: Array.isArray(raw) ? ["<array>"] : Object.keys(raw || {}),
      sample: typeof raw === "object" ? JSON.stringify(raw).slice(0, 600) : String(raw).slice(0, 600),
      timestamp: new Date().toISOString()
    }

    console.log(`Returning ${data.length} games with metadata`)

    return new Response(JSON.stringify({
      data: data.map(({ raw, ...rest }) => rest),
      _metadata: metadata
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('Discover games error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})