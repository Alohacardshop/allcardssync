import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { toJustTCGParams, normalizeGameSlug } from '../_shared/slug.ts'

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

async function discoverSetsForGame(supabase: any, apiKey: string, gameId: string): Promise<{ gameId: string; setsCount: number }> {
  console.log(`Discovering sets for game: ${gameId}`)
  
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded while fetching sets')
  }

  // Use correct game parameters for JustTCG API
  const { game, region } = toJustTCGParams(gameId)
  const regionParam = region ? `&region=${encodeURIComponent(region)}` : ''
  const url = `https://api.justtcg.com/v1/sets?game=${encodeURIComponent(game)}${regionParam}`
  
  console.log(`Calling JustTCG API: ${url}`)
  
  const response = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`JustTCG API error for ${gameId}: ${response.status} ${response.statusText}`)
  }

  const raw = await response.json()
  
  // Robust parsing - support common envelope formats
  const sets = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.sets)
        ? raw.sets
        : Array.isArray(raw?.results)
          ? raw.results
          : []
  
  console.log(`Found ${sets.length} sets for ${gameId}`)

  // Upsert sets into database
  if (sets.length > 0) {
    const setsData = sets.map((set: any) => ({
      provider: 'justtcg',
      set_id: set.id, // Keep as display/stable local key 
      provider_id: set.id, // Store API identifier for fetching
      game: gameId,
      name: set.name,
      series: set.series,
      printed_total: set.printedTotal,
      total: set.total,
      release_date: set.releaseDate ? new Date(set.releaseDate).toISOString().split('T')[0] : null,
      images: set.images || null,
      data: set,
      updated_from_source_at: new Date().toISOString()
    }))

    const { error } = await supabase.rpc('catalog_v2_upsert_sets', {
      rows: setsData
    })
    
    if (error) {
      console.error(`Error upserting sets for ${gameId}:`, error)
      throw error
    }
  }

  return { gameId, setsCount: sets.length }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log(`[${new Date().toISOString()}] Discover sets request received`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const apiKey = await getApiKey()
    
    // Parse query parameters and JSON body
    const url = new URL(req.url)
    let gameParam = url.searchParams.get('game')
    let gamesToProcess: string[] = []
    
    // Check for JSON body to get games array and loadFromDB mode
    if (req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
      try {
        const body = await req.json()
        
        // Handle loadFromDB mode - query sets from database instead of API
        if (body.loadFromDB === true) {
          console.log('Load from DB mode requested')
          
          // Get games to query (from body.games, body.gameIds, or all games)
          let gameIds: string[] = []
          if (body.games && Array.isArray(body.games)) {
            gameIds = body.games
          } else if (body.gameIds && Array.isArray(body.gameIds)) {
            gameIds = body.gameIds
          } else if (gameParam) {
            gameIds = [gameParam]
          }
          
          if (gameIds.length === 0) {
            // Get all games from database
            const { data: games, error: gamesError } = await supabase
              .from('games')
              .select('id')
              .order('id')

            if (gamesError) {
              throw gamesError
            }
            gameIds = games?.map(g => g.id) || []
          }
          
          console.log(`Querying sets from DB for games: ${gameIds.join(', ')}`)
          
          // Query sets from database using catalog_v2_browse_sets
          const setsByGame: { [gameId: string]: any[] } = {}
          let totalSits = 0
          
          for (const gameId of gameIds) {
            try {
              const { data: setsData, error: setsError } = await supabase.rpc('catalog_v2_browse_sets', {
                game_in: gameId,
                page_in: 1,
                limit_in: 1000 // Get more sets per game
              })
              
              if (setsError) {
                console.error(`Error querying sets for ${gameId}:`, setsError)
                setsByGame[gameId] = []
                continue
              }
              
              if (setsData && setsData.sets) {
                const sets = setsData.sets.map((set: any) => ({
                  id: set.set_id,
                  name: set.name,
                  released_at: set.release_date,
                  cards_count: set.cards_count
                }))
                setsByGame[gameId] = sets
                totalSits += sets.length
                console.log(`Found ${sets.length} sets for ${gameId}`)
              } else {
                setsByGame[gameId] = []
              }
            } catch (error: any) {
              console.error(`Error processing ${gameId}:`, error.message)
              setsByGame[gameId] = []
            }
          }
          
          const responseData = {
            setsByGame,
            totalSets: totalSits,
            _metadata: {
              gamesProcessed: gameIds.length,
              totalSetsLoaded: totalSits,
              timestamp: new Date().toISOString(),
              mode: 'database'
            }
          }
          
          console.log(`DB query completed: ${gameIds.length} games, ${totalSits} total sets`)
          
          return new Response(JSON.stringify(responseData), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
        }
        
        // Normal API discovery mode
        if (body.games && Array.isArray(body.games)) {
          // Multiple games from body
          gamesToProcess = body.games
          console.log(`Processing ${gamesToProcess.length} games from request body`)
        } else if (body.gameIds && Array.isArray(body.gameIds)) {
          // Handle gameIds as well
          gamesToProcess = body.gameIds
          console.log(`Processing ${gamesToProcess.length} games from gameIds`)
        } else if (gameParam) {
          gamesToProcess = [gameParam]
        }
      } catch (e) {
        // Fallback to query param if JSON parsing fails
        if (gameParam) {
          gamesToProcess = [gameParam]
        }
      }
    } else if (gameParam) {
      gamesToProcess = [gameParam]
    }
    
    if (gamesToProcess.length === 0) {
      // Get all games from database if no specific games were requested
      const { data: games, error: gamesError } = await supabase
        .from('games')
        .select('id')
        .order('id')

      if (gamesError) {
        throw gamesError
      }

      gamesToProcess = games?.map(g => g.id) || []
      console.log(`Processing all ${gamesToProcess.length} games from database`)
    } else {
      console.log(`Processing games: ${gamesToProcess.join(', ')}`)
    }

    const results: { gameId: string; setsCount: number }[] = []
    let totalSets = 0

    // Process each game sequentially to respect rate limits
    for (const gameId of gamesToProcess) {
      try {
        const result = await discoverSetsForGame(supabase, apiKey, gameId)
        results.push(result)
        totalSets += result.setsCount
        
        console.log(`✅ ${gameId}: ${result.setsCount} sets`)
        
        // Small delay between games to be respectful
        if (gamesToProcess.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (error: any) {
        console.error(`❌ Error processing ${gameId}:`, error.message)
        results.push({ gameId, setsCount: -1 }) // -1 indicates error
      }
    }

    const responseData = {
      data: results,
      totalSets,
      _metadata: {
        gamesProcessed: results.length,
        totalSetsDiscovered: totalSets,
        timestamp: new Date().toISOString(),
        mode: 'api_discovery',
        ...(totalSets === 0 && {
          topLevelKeys: gamesToProcess.length > 0 ? ["limited-sample"] : ["no-games-processed"],
          sample: "Check logs for detailed API response diagnostics"
        })
      }
    }

    console.log(`Discovery completed: ${results.length} games, ${totalSets} total sets`)

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('Discover sets error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})