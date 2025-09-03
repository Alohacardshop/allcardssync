import { useQuery } from '@tanstack/react-query';
import { tcgSupabase, Game, Set, Card, SearchResult, PopularCard, PricingData } from '@/lib/tcg-supabase';

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
        search_query: searchQuery,
        game_slug: gameSlug || null,
        set_code: setCode || null,
        limit_count: limitCount
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
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!cardId,
    staleTime: 10 * 60 * 1000,
  });
}

// Get card pricing
export async function fetchCardPricing(cardId: string, condition?: string, printing?: string, refresh = false): Promise<PricingData> {
  const response = await fetch('https://dhyvufggodqkcjbrjhxk.supabase.co/functions/v1/get-card-pricing', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      cardId,
      condition,
      printing,
      refresh
    })
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch pricing data');
  }
  
  return response.json();
}

export function useCardPricing(cardId?: string, condition?: string, printing?: string) {
  return useQuery({
    queryKey: ['tcg-pricing', cardId, condition, printing],
    queryFn: () => fetchCardPricing(cardId!, condition, printing, false),
    enabled: !!cardId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}