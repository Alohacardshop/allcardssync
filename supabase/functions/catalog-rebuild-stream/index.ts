import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_GAME_SLUGS = ['pokemon', 'pokemon-japan', 'mtg']

// Provider catalog types
type ProviderSet = { id: string; code?: string; name: string }
type ProviderCard = { id: string; setId: string; name: string; number?: string }
type ProviderVariant = { id: string; cardId: string; sku?: string }
type ProviderCatalog = { sets: ProviderSet[]; cards: ProviderCard[]; variants: ProviderVariant[] }

// Normalize names for exact matching
const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()

interface LogMessage {
  type: string
  timestamp?: string
  level?: 'info' | 'success' | 'error' | 'warning'
  message?: string
  game?: string
  step?: string
  data?: any
  error?: string
  rolled_back?: number
  not_found?: number
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

        const push = (log: LogMessage) => {
          const data = `data: ${JSON.stringify(log)}\n\n`
          controller.enqueue(new TextEncoder().encode(data))
        }

        const processRebuild = async () => {
          try {
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseServiceKey)

            // Database execution helpers
            const exec = async (sql: string) => {
              // Use direct SQL execution via a simple RPC that we'll create
              const { error } = await supabase.rpc('execute_sql', { sql_query: sql })
              if (error) throw error
            }

            const query = async (sql: string) => {
              // For queries, we'll use the from() method for simpler queries
              // For complex ones, we'll make a query RPC
              return []
            }

            // Provider catalog fetchers using existing edge functions
            const fetchProviderCatalog = async (game: string): Promise<ProviderCatalog> => {
              if (game === 'pokemon') {
                // For Pokemon, trigger existing sync function and extract data format
                push({ type: "IMPORT_PHASE", game, step: "CALLING_POKEMON_TCG_API" })
                const response = await fetch(`${supabaseUrl}/functions/v1/catalog-sync-pokemon`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ dryRun: true })
                })
                
                if (!response.ok) throw new Error(`Pokemon API call failed: ${response.status}`)
                const data = await response.json()
                
                return {
                  sets: data.sets?.map((s: any) => ({ id: s.id, code: s.code, name: s.name })) || [],
                  cards: data.cards?.map((c: any) => ({ id: c.id, setId: c.setId, name: c.name, number: c.number })) || [],
                  variants: []
                }
              } else if (game === 'pokemon-japan' || game === 'mtg') {
                // For JustTCG games, call existing JustTCG sync functions
                const gameParam = game === 'pokemon-japan' ? 'pokemon-japan' : 'magic-the-gathering'
                push({ type: "IMPORT_PHASE", game, step: "CALLING_JUSTTCG_API" })
                
                const response = await fetch(`${supabaseUrl}/functions/v1/catalog-sync-justtcg?game=${gameParam}`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${supabaseServiceKey}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ dryRun: true })
                })
                
                if (!response.ok) throw new Error(`JustTCG API call failed: ${response.status}`)
                const data = await response.json()
                
                return {
                  sets: data.sets?.map((s: any) => ({ id: s.id, code: s.code, name: s.name })) || [],
                  cards: data.cards?.map((c: any) => ({ id: c.id, setId: c.setId, name: c.name, number: c.number })) || [],
                  variants: data.variants?.map((v: any) => ({ id: v.id, cardId: v.cardId, sku: v.sku })) || []
                }
              }
              return { sets: [], cards: [], variants: [] }
            }

            // Simplified upsert helpers using Supabase client
            const upsertSetsNew = async (game: string, sets: ProviderSet[]) => {
              if (!sets?.length) return
              
              const rows = sets.map(s => ({
                game,
                provider_id: s.id,
                code: s.code || null,
                name: s.name
              }))
              
              // Delete existing shadow data for this game first
              await supabase.from('catalog_v2.sets_new').delete().eq('game', game)
              
              // Insert new data
              const { error } = await supabase.from('catalog_v2.sets_new').insert(rows)
              if (error) throw error
            }

            const upsertCardsNew = async (game: string, cards: ProviderCard[]) => {
              if (!cards?.length) return
              
              const rows = cards.map(c => ({
                game,
                provider_id: c.id,
                set_provider_id: c.setId,
                name: c.name,
                number: c.number || null
              }))
              
              // Delete existing shadow data for this game first  
              await supabase.from('catalog_v2.cards_new').delete().eq('game', game)
              
              // Insert new data
              const { error } = await supabase.from('catalog_v2.cards_new').insert(rows)
              if (error) throw error
            }

            const upsertVariantsNew = async (game: string, variants: ProviderVariant[]) => {
              if (!variants?.length) return
              
              const rows = variants.map(v => ({
                game,
                provider_id: v.id,
                card_provider_id: v.cardId,
                sku: v.sku || null
              }))
              
              // Delete existing shadow data for this game first
              await supabase.from('catalog_v2.variants_new').delete().eq('game', game)
              
              // Insert new data
              const { error } = await supabase.from('catalog_v2.variants_new').insert(rows)
              if (error) throw error
            }

            // Guardrails for fixing bad writes
            const fixBadWritesSets = async (game: string, apiSets: ProviderSet[]) => {
              const byId = new Map(apiSets.map(s => [s.id, s]))
              const validIds = new Set(apiSets.map(s => s.id))
              let rolled_back = 0, not_found = 0

              const { data: rows } = await supabase
                .from('catalog_v2.sets_new')
                .select('set_id, name, provider_id')
                .eq('game', game)
                .not('provider_id', 'is', null)

              if (!rows) return { rolled_back, not_found }

              for (const r of rows) {
                const pid = r.provider_id as string
                if (!validIds.has(pid)) {
                  await supabase
                    .from('catalog_v2.sets_new')
                    .update({ provider_id: null })
                    .eq('set_id', r.set_id)
                  not_found++
                  continue
                }
                const api = byId.get(pid)!
                if (normalizeName(api.name) !== normalizeName(r.name)) {
                  await supabase
                    .from('catalog_v2.sets_new')
                    .update({ provider_id: null })
                    .eq('set_id', r.set_id)
                  rolled_back++
                }
              }
              return { rolled_back, not_found }
            }

            const zeroNullProviderIdsInSetsNew = async (game: string) => {
              const { count } = await supabase
                .from('catalog_v2.sets_new')
                .select('*', { count: 'exact' })
                .eq('game', game)
                .is('provider_id', null)
              
              return (count || 0) === 0
            }

            const atomicSwap = async (game: string) => {
              // For atomic swap, we need to use a database function that does it in a transaction
              const { error } = await supabase.rpc('atomic_catalog_swap', { game_name: game })
              if (error) throw error
            }

            push({ type: "START", games: requestedGames })

            for (const game of requestedGames) {
              push({ type: "START_GAME", game })

              try {
                // 1) Fetch provider catalog (this also clears shadow tables)
                push({ type: "IMPORT_PHASE", game, step: "FETCH_PROVIDER" })
                const provider = await fetchProviderCatalog(game)

                // 2) Upsert into shadow tables
                push({ type: "IMPORT_PHASE", game, step: "UPSERT" })
                await upsertSetsNew(game, provider.sets)
                await upsertCardsNew(game, provider.cards)
                await upsertVariantsNew(game, provider.variants)

                // 3) Guardrails - fix bad writes on sets
                push({ type: "FIX_BAD_WRITES", game })
                const { rolled_back, not_found } = await fixBadWritesSets(game, provider.sets)
                push({ type: "FIX_BAD_WRITES_SUMMARY", game, rolled_back, not_found })

                // 4) Validate
                push({ type: "VALIDATE", game })
                const ok = await zeroNullProviderIdsInSetsNew(game)
                if (!ok) { 
                  push({ type: "ERROR", game, error: "VALIDATION_FAILED" })
                  continue
                }

                // 5) Atomic swap using database function
                push({ type: "READY_TO_SWAP", game })
                await atomicSwap(game)
                push({ type: "SWAP_DONE", game })

              } catch (gameError: any) {
                push({ type: "ERROR", game, error: gameError.message })
              }
            }

            push({ type: "COMPLETE" })

          } catch (error: any) {
            push({ type: "ERROR", error: error.message })
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