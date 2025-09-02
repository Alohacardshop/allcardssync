import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// External TCG database connection
const tcgSupabase = createClient(
  'https://dhyvufggodqkcjbrjhxk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXV1Zmdnb2Rxa2NqYnJqaHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MDIyOTcsImV4cCI6MjA3MjA3ODI5N30.0GncadcSHVbthqyubXLiBflm44sFEz_izfF5uF-xEvs'
)

interface SearchParams {
  search_query: string
  game_slug?: string
  set_code?: string
  limit_count?: number
}

interface PricingParams {
  cardId: string
  condition?: string
  refresh?: boolean
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'search'

    if (action === 'search') {
      return await handleCardSearch(req)
    } else if (action === 'pricing') {
      return await handleCardPricing(req)
    } else if (action === 'games') {
      return await handleGetGames(req)
    } else {
      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error) {
    console.error('TCG search error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleCardSearch(req: Request) {
  const { search_query, game_slug, set_code, limit_count = 20 }: SearchParams = await req.json()

  if (!search_query?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Search query is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log('Searching cards:', { search_query, game_slug, set_code, limit_count })

  const { data: searchResults, error } = await tcgSupabase.rpc('search_cards', {
    search_query: search_query.trim(),
    game_slug: game_slug || null,
    set_code: set_code || null,
    limit_count: Math.min(limit_count, 100) // Cap at 100 results
  })

  if (error) {
    console.error('Search error:', error)
    return new Response(
      JSON.stringify({ error: 'Search failed', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      results: searchResults || [],
      count: searchResults?.length || 0
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleCardPricing(req: Request) {
  const { cardId, condition, refresh = false }: PricingParams = await req.json()

  if (!cardId) {
    return new Response(
      JSON.stringify({ error: 'Card ID is required' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  console.log('Fetching pricing for card:', { cardId, condition, refresh })

  // Call the external pricing function
  const params = new URLSearchParams({ 
    cardId,
    refresh: refresh.toString()
  })
  if (condition) params.append('condition', condition)

  const pricingResponse = await fetch(
    `https://dhyvufggodqkcjbrjhxk.supabase.co/functions/v1/get-card-pricing?${params}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXV1Zmdnb2Rxa2NqYnJqaHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MDIyOTcsImV4cCI6MjA3MjA3ODI5N30.0GncadcSHVbthqyubXLiBflm44sFEz_izfF5uF-xEvs`
      }
    }
  )

  if (!pricingResponse.ok) {
    const errorText = await pricingResponse.text()
    console.error('Pricing API error:', errorText)
    return new Response(
      JSON.stringify({ error: 'Pricing fetch failed', details: errorText }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const pricingData = await pricingResponse.json()

  return new Response(
    JSON.stringify(pricingData),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}

async function handleGetGames(req: Request) {
  console.log('Fetching active games')

  const { data: games, error } = await tcgSupabase
    .from('games')
    .select('name, slug, is_active')
    .eq('is_active', true)
    .order('name')

  if (error) {
    console.error('Games fetch error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch games', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({
      success: true,
      games: games || []
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}