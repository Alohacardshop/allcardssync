import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    const url = new URL(req.url)
    const game = url.searchParams.get('game')
    
    if (!game) {
      return new Response(
        JSON.stringify({ error: 'Game parameter is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Normalize game slug for consistent querying
    function normalizeGameSlug(g: string): string {
      const normalized = (g || '').toLowerCase();
      if (normalized === 'pokemon_japan') return 'pokemon-japan';
      if (normalized === 'mtg') return 'magic-the-gathering';
      return normalized;
    }

    const normalizedGame = normalizeGameSlug(game)

    // Query sets from catalog_v2.sets table
    const { data: setsData, error: setsError } = await supabaseClient
      .from('catalog_v2.sets')
      .select(`
        set_id,
        name,
        release_date,
        total,
        printed_total
      `)
      .eq('game', normalizedGame)
      .order('release_date', { ascending: false, nullsLast: true })

    if (setsError) {
      console.error('Database error fetching sets:', setsError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch sets' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get card counts for each set
    const setsWithCounts = await Promise.all(
      (setsData || []).map(async (set) => {
        const { count, error: countError } = await supabaseClient
          .from('catalog_v2.cards')
          .select('*', { count: 'exact', head: true })
          .eq('game', normalizedGame)
          .eq('set_id', set.set_id)

        if (countError) {
          console.warn(`Failed to get card count for set ${set.set_id}:`, countError)
        }

        return {
          id: set.set_id,
          name: set.name,
          released_at: set.release_date,
          total: set.total || set.printed_total,
          cards_count: count || 0
        }
      })
    )

    return new Response(
      JSON.stringify({
        game: normalizedGame,
        sets: setsWithCounts,
        total_sets: setsWithCounts.length
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})