import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Import shared utilities
import { postCardsByIds, logStructured } from "../_lib/justtcg.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Get API key from environment or system settings
async function getApiKey(): Promise<string> {
  const envKey = Deno.env.get("JUSTTCG_API_KEY");
  if (envKey) return envKey;
  
  const { data } = await supabaseClient
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'JUSTTCG_API_KEY')
    .single();
    
  if (data?.key_value) return data.key_value;
  throw new Error("JUSTTCG_API_KEY not found");
}

// Load watchlist for a game
async function loadWatchlist(game: string): Promise<string[]> {
  const { data, error } = await supabaseClient
    .from('justtcg_watchlist')
    .select('card_id')
    .eq('game', game);
    
  if (error) throw error;
  
  return data?.map(row => row.card_id) || [];
}

// Save analytics snapshot
async function saveSnapshot(game: string, cards: any[]): Promise<number> {
  const snapshots: any[] = [];
  
  for (const card of cards) {
    const variants = card.variants || [];
    
    // Find cheapest price
    const prices = variants
      .map((v: any) => v.price || v.marketPrice)
      .filter((p: number) => p > 0);
    const cheapestPrice = prices.length > 0 ? Math.min(...prices) : null;
    
    // Calculate changes from variants (simplified - in real implementation you'd compare with historical data)
    const changes24h = variants
      .map((v: any) => v.change24h || 0)
      .filter((c: number) => c !== 0);
    const changes7d = variants
      .map((v: any) => v.change7d || 0)
      .filter((c: number) => c !== 0);
    const changes30d = variants
      .map((v: any) => v.change30d || 0)
      .filter((c: number) => c !== 0);
    
    snapshots.push({
      game,
      card_id: card.id,
      card_name: card.name,
      cheapest_price: cheapestPrice,
      change_24h: changes24h.length > 0 ? changes24h[0] : null,
      change_7d: changes7d.length > 0 ? changes7d[0] : null,
      change_30d: changes30d.length > 0 ? changes30d[0] : null,
      raw: card
    });
  }
  
  if (snapshots.length === 0) return 0;
  
  // Insert in chunks
  const chunkSize = 200;
  let totalInserted = 0;
  
  for (let i = 0; i < snapshots.length; i += chunkSize) {
    const chunk = snapshots.slice(i, i + chunkSize);
    const { error, count } = await supabaseClient
      .from('justtcg_analytics_snapshots')
      .insert(chunk)
      .select('*')
      .order('created_at', { ascending: false })
      
    if (error) throw error;
    totalInserted += count || 0;
  }
  
  return totalInserted;
}

// Run snapshot for a single game
async function runGameSnapshot(game: string, apiKey: string): Promise<{
  cardsWatched: number;
  cardsProcessed: number;
  snapshotsSaved: number;
}> {
  logStructured('INFO', 'Starting game snapshot', { game });
  
  // Load watchlist
  const cardIds = await loadWatchlist(game);
  
  if (cardIds.length === 0) {
    logStructured('WARN', 'No cards in watchlist for game', { game });
    return { cardsWatched: 0, cardsProcessed: 0, snapshotsSaved: 0 };
  }
  
  // Fetch latest data with analytics sorting
  const result = await postCardsByIds(cardIds, apiKey, '24h'); // Order by 24h changes
  
  // Sort cards by 24h change (desc) and variants by price (asc)
  const sortedCards = result.data.sort((a, b) => {
    const aChange = a.variants?.[0]?.change24h || 0;
    const bChange = b.variants?.[0]?.change24h || 0;
    return bChange - aChange; // Descending
  });
  
  sortedCards.forEach(card => {
    if (card.variants) {
      card.variants.sort((a: any, b: any) => {
        const aPrice = a.price || a.marketPrice || 0;
        const bPrice = b.price || b.marketPrice || 0;
        return aPrice - bPrice; // Ascending
      });
    }
  });
  
  // Save snapshots
  const snapshotsSaved = await saveSnapshot(game, sortedCards);
  
  logStructured('INFO', 'Game snapshot completed', {
    game,
    cardsWatched: cardIds.length,
    cardsProcessed: sortedCards.length,
    snapshotsSaved
  });
  
  return {
    cardsWatched: cardIds.length,
    cardsProcessed: sortedCards.length,
    snapshotsSaved
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const game = url.searchParams.get('game');
    
    const apiKey = await getApiKey();
    
    if (game) {
      // Single game snapshot
      const result = await runGameSnapshot(game, apiKey);
      
      return new Response(
        JSON.stringify({
          game,
          ...result,
          message: `Snapshot completed for ${game}`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // All games snapshot (for cron job)
      const games = ['magic-the-gathering', 'pokemon', 'pokemon-japan'];
      const results = [];
      
      for (const gameSlug of games) {
        try {
          const result = await runGameSnapshot(gameSlug, apiKey);
          results.push({ game: gameSlug, ...result });
        } catch (error: any) {
          logStructured('ERROR', 'Game snapshot failed', {
            game: gameSlug,
            error: error.message
          });
          results.push({
            game: gameSlug,
            error: error.message,
            cardsWatched: 0,
            cardsProcessed: 0,
            snapshotsSaved: 0
          });
        }
      }
      
      const totalSnapshots = results.reduce((sum, r) => sum + (r.snapshotsSaved || 0), 0);
      
      logStructured('INFO', 'All games snapshot completed', {
        totalGames: results.length,
        totalSnapshots,
        results
      });
      
      return new Response(
        JSON.stringify({
          games: results,
          totalSnapshots,
          message: `Nightly snapshot completed for ${games.length} games`
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error: any) {
    logStructured('ERROR', 'Snapshot failed', {
      error: error.message,
      stack: error.stack
    });

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});