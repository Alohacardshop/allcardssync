import { useQuery } from '@tanstack/react-query';
import { tcgSupabase, Game, Set, Card, SearchResult, PopularCard, PricingData } from '@/integrations/supabase/client';

// Get all games
export function useGames() {
  return useQuery({
    queryKey: ['tcg-games'],
    queryFn: async () => {
      const { data, error } = await tcgSupabase
        .from('games')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data as Game[];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}

// Get sets for a game
export function useGameSets(gameId?: string) {
  return useQuery({
    queryKey: ['tcg-sets', gameId],
    queryFn: async () => {
      if (!gameId) return [];
      
      const { data, error } = await tcgSupabase
        .from('sets')
        .select('*')
        .eq('game_id', gameId)
        .order('release_date', { ascending: false });
      
      if (error) throw error;
      return data as Set[];
    },
    enabled: !!gameId,
    staleTime: 10 * 60 * 1000,
  });
}

// Search cards
export function useCardSearch(searchQuery: string, gameSlug?: string, setCode?: string, limitCount = 20) {
  return useQuery({
    queryKey: ['tcg-search', searchQuery, gameSlug, setCode, limitCount],
    queryFn: async () => {
      if (!searchQuery.trim()) return [];
      
      const { data, error } = await tcgSupabase.rpc('search_cards', {
        game_in: gameSlug || '',
        q: searchQuery,
        lim: limitCount,
        off: 0
      });
      
      if (error) throw error;
      return data as SearchResult[];
    },
    enabled: !!searchQuery.trim(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

// Get popular cards
export function usePopularCards(gameSlug?: string, limit = 20) {
  return useQuery({
    queryKey: ['tcg-popular', gameSlug, limit],
    queryFn: async () => {
      let query = tcgSupabase
        .from('popular_cards')
        .select('*')
        .limit(limit);
      
      if (gameSlug) {
        // Assuming popular_cards view has game_slug column
        query = query.eq('game_slug', gameSlug);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as PopularCard[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Get card details
export function useCard(cardId?: string) {
  return useQuery({
    queryKey: ['tcg-card', cardId],
    queryFn: async () => {
      if (!cardId) return null;
      
      const { data, error } = await tcgSupabase
        .from('cards')
        .select(`
          *,
          sets:set_id (
            id,
            name,
            code,
            games:game_id (
              id,
              name,
              slug
            )
          )
        `)
        .eq('id', cardId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) throw new Error(`Card with ID ${cardId} not found`);
      return data;
    },
    enabled: !!cardId,
    staleTime: 10 * 60 * 1000,
  });
}

// Get card pricing - use our proxy
export async function fetchCardPricing(cardId: string, condition?: string, printing?: string, refresh = false): Promise<PricingData> {
  try {
    const { getCachedPricingViaDB, updateVariantPricing } = await import('@/integrations/supabase/client');
    
    // Use cached DB read by default, edge function for refresh
    return refresh 
      ? await updateVariantPricing(cardId, condition, printing)
      : await getCachedPricingViaDB(cardId, condition, printing);
  } catch (error) {
    console.error('fetchCardPricing error:', error);
    throw error;
  }
}

export function useCardPricing(cardId?: string, condition?: string, printing?: string) {
  return useQuery({
    queryKey: ['tcg-pricing', cardId, condition, printing],
    queryFn: () => fetchCardPricing(cardId!, condition, printing, false),
    enabled: !!cardId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}