#!/usr/bin/env tsx

import { config } from 'dotenv'

// Load environment variables
config()

const FUNCTIONS_BASE = process.env.VITE_SUPABASE_FUNCTIONS_URL?.replace(/\/+$/, '') || 'http://localhost:54321/functions/v1'

interface ResetResponse {
  success: boolean
  total_records_deleted: number
  games_processed: number
  summaries: Array<{
    game: string
    variants_deleted: number
    cards_deleted: number
    sets_deleted: number
    sync_errors_deleted: number
    queue_items_deleted: number
  }>
  error?: string
}

interface SyncResponse {
  mode?: string
  message?: string
  queued?: number
  error?: string
}

async function callFunction(endpoint: string, body: any = {}): Promise<any> {
  const url = `${FUNCTIONS_BASE}${endpoint}`
  console.log(`📡 Calling: ${url}`)
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  return response.json()
}

async function resetAndRebuildCatalog() {
  console.log('🧹 Starting catalog reset and rebuild process...')
  console.log('=' .repeat(50))

  try {
    // Step 1: Reset all catalogs
    console.log('1️⃣ Resetting all catalogs...')
    const resetResponse: ResetResponse = await callFunction('/catalog-reset', {
      games: ['pokemon', 'pokemon-japan', 'mtg']
    })

    if (resetResponse.success) {
      console.log(`✅ Reset complete: ${resetResponse.total_records_deleted} records deleted`)
      resetResponse.summaries.forEach(summary => {
        if (summary.variants_deleted >= 0) {
          console.log(`   ${summary.game}: ${summary.variants_deleted + summary.cards_deleted + summary.sets_deleted + summary.sync_errors_deleted + summary.queue_items_deleted} records`)
        } else {
          console.log(`   ${summary.game}: ERROR`)
        }
      })
    } else {
      throw new Error(resetResponse.error || 'Reset failed')
    }

    console.log()

    // Step 2: Trigger Pokemon sync
    console.log('2️⃣ Starting Pokemon (Global) sync...')
    const pokemonResponse: SyncResponse = await callFunction('/catalog-sync-pokemon')
    console.log(`✅ Pokemon sync: ${pokemonResponse.message || 'Started'} (queued: ${pokemonResponse.queued || 'N/A'})`)

    console.log()

    // Step 3: Trigger Pokemon Japan sync  
    console.log('3️⃣ Starting Pokemon Japan sync...')
    const japanResponse: SyncResponse = await callFunction('/catalog-sync-justtcg', {
      game: 'pokemon-japan'
    })
    console.log(`✅ Pokemon Japan sync: ${japanResponse.message || 'Started'} (queued: ${japanResponse.queued || 'N/A'})`)

    console.log()

    // Step 4: Trigger MTG sync
    console.log('4️⃣ Starting Magic: The Gathering sync...')
    const mtgResponse: SyncResponse = await callFunction('/catalog-sync-justtcg', {
      game: 'magic-the-gathering'
    })
    console.log(`✅ MTG sync: ${mtgResponse.message || 'Started'} (queued: ${mtgResponse.queued || 'N/A'})`)

    console.log()
    console.log('=' .repeat(50))
    console.log('🎉 Catalog reset and rebuild process completed!')
    console.log('💡 Monitor progress in the Admin > Sync tab')

  } catch (error: any) {
    console.error('❌ Error during reset and rebuild:', error.message)
    process.exit(1)
  }
}

// Run the script
resetAndRebuildCatalog()