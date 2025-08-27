import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GAME_SLUGS = ['pokemon', 'pokemon-japan', 'mtg']

interface LogMessage {
  timestamp: string
  level: 'info' | 'success' | 'error' | 'warning'
  message: string
  data?: any
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const requestedGames = body.games || ['pokemon', 'pokemon-japan', 'mtg']
    
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

    // Set up Server-Sent Events
    const stream = new ReadableStream({
      start(controller) {
        const sendLog = (log: LogMessage) => {
          const data = `data: ${JSON.stringify(log)}\n\n`
          controller.enqueue(new TextEncoder().encode(data))
        }

        const processRebuild = async () => {
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            sendLog({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Starting catalog reset and rebuild for games: ${requestedGames.join(', ')}`
            })

            // Step 1: Reset catalogs
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: '🧹 Step 1/2: Resetting catalog data...'
            })

            let totalDeleted = 0
            const resetSummaries = []

            for (const game of requestedGames) {
              sendLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Clearing ${game} catalog data...`
              })

              try {
                // Get card IDs first for variant deletion
                const { data: cardIds } = await supabase
                  .from('catalog_v2.cards')
                  .select('card_id')
                  .eq('game', game)

                const cardIdList = cardIds?.map(c => c.card_id) || []

                // Delete in correct order
                let variantsDeleted = 0
                if (cardIdList.length > 0) {
                  const { count } = await supabase
                    .from('catalog_v2.variants')
                    .delete()
                    .in('card_id', cardIdList)
                  variantsDeleted = count || 0
                }

                const { count: cardsDeleted } = await supabase
                  .from('catalog_v2.cards')
                  .delete()
                  .eq('game', game)

                const { count: setsDeleted } = await supabase
                  .from('catalog_v2.sets')
                  .delete()
                  .eq('game', game)

                const { count: errorsDeleted } = await supabase
                  .from('catalog_v2.sync_errors')
                  .delete()
                  .eq('game', game)

                const { count: queueDeleted } = await supabase
                  .from('sync_queue')
                  .delete()
                  .or(`game.eq.${game},mode.eq.${game}`)

                const gameTotal = (variantsDeleted || 0) + (cardsDeleted || 0) + (setsDeleted || 0) + (errorsDeleted || 0) + (queueDeleted || 0)
                totalDeleted += gameTotal

                resetSummaries.push({
                  game,
                  variants_deleted: variantsDeleted || 0,
                  cards_deleted: cardsDeleted || 0,
                  sets_deleted: setsDeleted || 0,
                  sync_errors_deleted: errorsDeleted || 0,
                  queue_items_deleted: queueDeleted || 0
                })

                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'success',
                  message: `✅ ${game}: ${gameTotal} records deleted`
                })

              } catch (gameError: any) {
                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'error',
                  message: `❌ Failed to reset ${game}: ${gameError.message}`
                })
              }
            }

            sendLog({
              timestamp: new Date().toISOString(),
              level: 'success',
              message: `🎉 Reset completed: ${totalDeleted} total records deleted`
            })

            // Step 2: Trigger syncs
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: '🚀 Step 2/2: Starting fresh imports...'
            })

            const functionsBase = `${supabaseUrl}/functions/v1`
            const syncResults = []

            for (const game of requestedGames) {
              sendLog({
                timestamp: new Date().toISOString(),
                level: 'info',
                message: `Starting sync for ${game}...`
              })

              try {
                let syncUrl = ''
                if (game === 'pokemon') {
                  syncUrl = `${functionsBase}/catalog-sync-pokemon`
                } else if (game === 'pokemon-japan') {
                  syncUrl = `${functionsBase}/catalog-sync-justtcg?game=pokemon-japan`
                } else if (game === 'mtg') {
                  syncUrl = `${functionsBase}/catalog-sync-justtcg?game=magic-the-gathering`
                }

                const syncResponse = await fetch(syncUrl, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseServiceKey}`
                  },
                  body: JSON.stringify({})
                })

                const syncData = await syncResponse.json()
                syncResults.push({ game, success: syncResponse.ok, data: syncData })

                if (syncResponse.ok) {
                  sendLog({
                    timestamp: new Date().toISOString(),
                    level: 'success',
                    message: `✅ ${game} sync started successfully`
                  })
                } else {
                  sendLog({
                    timestamp: new Date().toISOString(),
                    level: 'error',
                    message: `❌ ${game} sync failed: ${syncData.error || 'Unknown error'}`
                  })
                }

              } catch (syncError: any) {
                sendLog({
                  timestamp: new Date().toISOString(),
                  level: 'error',
                  message: `❌ ${game} sync error: ${syncError.message}`
                })
                syncResults.push({ game, success: false, error: syncError.message })
              }
            }

            const successfulSyncs = syncResults.filter(r => r.success).length

            sendLog({
              timestamp: new Date().toISOString(),
              level: 'success',
              message: `🎉 Reset & rebuild completed! ${successfulSyncs}/${requestedGames.length} syncs started successfully`
            })

            // Final summary
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: 'COMPLETE',
              data: {
                resetSummaries,
                syncResults,
                totalDeleted,
                successfulSyncs
              }
            })

          } catch (error: any) {
            sendLog({
              timestamp: new Date().toISOString(),
              level: 'error',
              message: `❌ Process failed: ${error.message}`
            })
          } finally {
            controller.close()
          }
        }

        // Start the rebuild process
        processRebuild()
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})