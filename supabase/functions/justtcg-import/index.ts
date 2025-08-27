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

// Rate limiting: 500 requests per minute (8.33 per second)
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

async function makeApiRequest(url: string): Promise<any> {
  if (!checkRateLimit()) {
    throw new Error('Rate limit exceeded. Please wait before making more requests.')
  }

  const apiKey = await getApiKey()
  
  console.log(`Making API request: ${url}`)
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return await response.json()
}

async function discoverGames(supabase: any): Promise<string[]> {
  console.log('Discovering games...')
  
  const response = await makeApiRequest('https://api.justtcg.com/v1/games')
  const games = response.games || []
  
  console.log(`Found ${games.length} games:`, games.map((g: any) => g.id).join(', '))

  // Upsert games into database
  if (games.length > 0) {
    const { error } = await supabase
      .from('justtcg_games')
      .upsert(
        games.map((game: any) => ({
          id: game.id,
          name: game.name || game.id,
          active: true
        })),
        { onConflict: 'id' }
      )
    
    if (error) {
      console.error('Error upserting games:', error)
    }
  }

  return games.map((g: any) => g.id)
}

async function fetchSets(supabase: any, gameId: string): Promise<any[]> {
  console.log(`Fetching sets for game: ${gameId}`)
  
  const response = await makeApiRequest(`https://api.justtcg.com/v1/sets?game=${encodeURIComponent(gameId)}`)
  const sets = response.sets || []
  
  console.log(`Found ${sets.length} sets for ${gameId}`)

  // Upsert sets into database
  if (sets.length > 0) {
    const setsData = sets.map((set: any) => ({
      provider: 'justtcg',
      set_id: set.id,
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
      rows: JSON.stringify(setsData)
    })
    
    if (error) {
      console.error('Error upserting sets:', error)
      throw error
    }
  }

  return sets
}

async function fetchCards(supabase: any, gameId: string, setId: string): Promise<{ cards: number, variants: number }> {
  console.log(`Fetching cards for ${gameId}/${setId}`)
  
  let offset = 0
  const limit = 200
  let totalCards = 0
  let totalVariants = 0
  let hasMore = true

  while (hasMore) {
    const url = `https://api.justtcg.com/v1/cards?game=${encodeURIComponent(gameId)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`
    
    const response = await makeApiRequest(url)
    const cards = response.cards || []
    
    if (cards.length === 0) {
      hasMore = false
      break
    }

    console.log(`Processing page at offset ${offset}: ${cards.length} cards`)

    // Process cards and variants
    const cardsData: any[] = []
    const variantsData: any[] = []

    for (const card of cards) {
      cardsData.push({
        provider: 'justtcg',
        card_id: card.id,
        game: gameId,
        set_id: setId,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        supertype: card.supertype,
        subtypes: card.subtypes || [],
        images: card.images || null,
        tcgplayer_product_id: card.tcgplayer?.productId || null,
        tcgplayer_url: card.tcgplayer?.url || null,
        data: card,
        updated_from_source_at: new Date().toISOString()
      })

      // Process variants
      if (card.variants && Array.isArray(card.variants)) {
        for (const variant of card.variants) {
          // Skip unchanged variants if they have lastUpdated
          if (variant.lastUpdated) {
            const lastUpdated = new Date(variant.lastUpdated)
            
            // Check if we already have this variant with same or newer update time
            const { data: existingVariant } = await supabase
              .from('catalog_v2.variants')
              .select('updated_from_source_at')
              .eq('provider', 'justtcg')
              .eq('card_id', card.id)
              .eq('language', variant.language || 'English')
              .eq('printing', variant.printing || 'Normal')
              .eq('condition', variant.condition || 'Near Mint')
              .maybeSingle()

            if (existingVariant && new Date(existingVariant.updated_from_source_at) >= lastUpdated) {
              continue // Skip this variant as it's not newer
            }
          }

          variantsData.push({
            provider: 'justtcg',
            variant_id: variant.id || null,
            card_id: card.id,
            game: gameId,
            language: variant.language || 'English',
            printing: variant.printing || 'Normal',
            condition: variant.condition || 'Near Mint',
            sku: variant.sku || null,
            price: variant.price || null,
            market_price: variant.marketPrice || null,
            low_price: variant.lowPrice || null,
            mid_price: variant.midPrice || null,
            high_price: variant.highPrice || null,
            currency: variant.currency || 'USD',
            data: variant,
            updated_from_source_at: new Date().toISOString()
          })
        }
      }
    }

    // Batch upsert cards
    if (cardsData.length > 0) {
      const { error: cardsError } = await supabase.rpc('catalog_v2_upsert_cards', {
        rows: JSON.stringify(cardsData)
      })
      
      if (cardsError) {
        console.error('Error upserting cards:', cardsError)
        throw cardsError
      }
      totalCards += cardsData.length
    }

    // Batch upsert variants
    if (variantsData.length > 0) {
      const { error: variantsError } = await supabase.rpc('catalog_v2_upsert_variants', {
        rows: JSON.stringify(variantsData)
      })
      
      if (variantsError) {
        console.error('Error upserting variants:', variantsError)
        throw variantsError
      }
      totalVariants += variantsData.length
    }

    offset += limit
    hasMore = cards.length === limit
  }

  return { cards: totalCards, variants: totalVariants }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log(`[${new Date().toISOString()}] JustTCG import request received`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse query parameters
    const url = new URL(req.url)
    const gameId = url.searchParams.get('game')
    const setId = url.searchParams.get('setId')

    let result: any = {
      success: true,
      gamesProcessed: 0,
      setsProcessed: 0,
      cardsProcessed: 0,
      variantsProcessed: 0,
      details: []
    }

    if (setId && gameId) {
      // Import specific set only
      console.log(`Importing specific set: ${gameId}/${setId}`)
      
      const cardResult = await fetchCards(supabase, gameId, setId)
      result.setsProcessed = 1
      result.cardsProcessed = cardResult.cards
      result.variantsProcessed = cardResult.variants
      result.details.push({
        game: gameId,
        set: setId,
        cards: cardResult.cards,
        variants: cardResult.variants
      })
      
    } else if (gameId) {
      // Import single game
      console.log(`Importing single game: ${gameId}`)
      
      const sets = await fetchSets(supabase, gameId)
      result.gamesProcessed = 1
      result.setsProcessed = sets.length
      
      let gameCards = 0
      let gameVariants = 0
      
      for (const set of sets) {
        const cardResult = await fetchCards(supabase, gameId, set.id)
        gameCards += cardResult.cards
        gameVariants += cardResult.variants
        
        result.details.push({
          game: gameId,
          set: set.id,
          cards: cardResult.cards,
          variants: cardResult.variants
        })
      }
      
      result.cardsProcessed = gameCards
      result.variantsProcessed = gameVariants
      
    } else {
      // Import all games
      console.log('Importing all games')
      
      const games = await discoverGames(supabase)
      result.gamesProcessed = games.length
      
      let totalCards = 0
      let totalVariants = 0
      let totalSets = 0
      
      for (const game of games) {
        console.log(`Processing game: ${game}`)
        
        const sets = await fetchSets(supabase, game)
        totalSets += sets.length
        
        for (const set of sets) {
          const cardResult = await fetchCards(supabase, game, set.id)
          totalCards += cardResult.cards
          totalVariants += cardResult.variants
          
          result.details.push({
            game: game,
            set: set.id,
            cards: cardResult.cards,
            variants: cardResult.variants
          })
        }
      }
      
      result.setsProcessed = totalSets
      result.cardsProcessed = totalCards
      result.variantsProcessed = totalVariants
    }

    console.log(`Import completed:`, result)

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
    
  } catch (error: any) {
    console.error('JustTCG import error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
