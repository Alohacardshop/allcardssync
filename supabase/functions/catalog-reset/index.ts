import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GAME_SLUGS = ['pokemon', 'pokemon-japan', 'mtg']

interface ResetSummary {
  game: string
  variants_deleted: number
  cards_deleted: number
  sets_deleted: number
  sync_errors_deleted: number
  queue_items_deleted: number
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${new Date().toISOString()}] Catalog reset request received`)
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const body = await req.json().catch(() => ({}))
    const requestedGames = body.games || ['pokemon', 'pokemon-japan', 'mtg']
    
    console.log('Requested games for reset:', requestedGames)

    // Validate game slugs
    const invalidGames = requestedGames.filter((game: string) => !VALID_GAME_SLUGS.includes(game))
    if (invalidGames.length > 0) {
      return new Response(
        JSON.stringify({ 
          error: `Invalid game slugs: ${invalidGames.join(', ')}. Valid options: ${VALID_GAME_SLUGS.join(', ')}`
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const resetSummaries: ResetSummary[] = []

    // Process each game
    for (const game of requestedGames) {
      console.log(`Starting reset for game: ${game}`)
      const startTime = Date.now()
      
      try {
        // 1. Delete variants (must be first due to foreign key constraints)
        // First get card IDs, then delete variants
        const { data: cardIds } = await supabase
          .from('catalog_v2.cards')
          .select('card_id')
          .eq('game', game)

        const cardIdList = cardIds?.map(c => c.card_id) || []
        let variantsDeleted = 0
        if (cardIdList.length > 0) {
          const { count } = await supabase
            .from('catalog_v2.variants')
            .delete()
            .in('card_id', cardIdList)
          variantsDeleted = count || 0
        }

        // 2. Delete cards
        const { count: cardsDeleted } = await supabase
          .from('catalog_v2.cards')
          .delete()
          .eq('game', game)

        // 3. Delete sets
        const { count: setsDeleted } = await supabase
          .from('catalog_v2.sets')
          .delete()
          .eq('game', game)

        // 4. Delete sync errors
        const { count: errorsDeleted } = await supabase
          .from('catalog_v2.sync_errors')
          .delete()
          .eq('game', game)

        // 5. Delete queue items (check both game and mode columns)
        const { count: queueDeleted } = await supabase
          .from('sync_queue')
          .delete()
          .or(`game.eq.${game},mode.eq.${game}`)

        const summary: ResetSummary = {
          game,
          variants_deleted: variantsDeleted,
          cards_deleted: cardsDeleted || 0,
          sets_deleted: setsDeleted || 0,
          sync_errors_deleted: errorsDeleted || 0,
          queue_items_deleted: queueDeleted || 0
        }

        resetSummaries.push(summary)
        
        const duration = Date.now() - startTime
        console.log(`Reset completed for ${game} in ${duration}ms:`, summary)
        
      } catch (gameError: any) {
        console.error(`Error resetting ${game}:`, gameError)
        resetSummaries.push({
          game,
          variants_deleted: -1, // -1 indicates error
          cards_deleted: -1,
          sets_deleted: -1,
          sync_errors_deleted: -1,
          queue_items_deleted: -1
        })
      }
    }

    const totalDeleted = resetSummaries.reduce((sum, summary) => {
      if (summary.variants_deleted < 0) return sum // Skip error cases
      return sum + summary.variants_deleted + summary.cards_deleted + 
             summary.sets_deleted + summary.sync_errors_deleted + summary.queue_items_deleted
    }, 0)

    console.log(`Catalog reset completed. Total records deleted: ${totalDeleted}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        total_records_deleted: totalDeleted,
        games_processed: resetSummaries.length,
        summaries: resetSummaries
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
    
  } catch (error: any) {
    console.error('Catalog reset error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})