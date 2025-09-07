import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { tcgLjyClient, ExternalGame, ExternalSet, ExternalCard, ExternalPrice, SearchFilters } from '@/integrations/supabase/tcgLjyClient';

// Games hook
export const useExternalGames = () => {
  return useQuery({
    queryKey: ['external-games'],
    queryFn: async (): Promise<ExternalGame[]> => {
      const { data, error } = await tcgLjyClient
        .from('games')
        .select('id, name, slug')
        .order('name');
      
      if (error) {
        console.error('Error fetching external games:', error);
        throw error;
      }
      
      return data || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};

// Sets hook
export const useExternalSets = (gameId?: string) => {
  return useQuery({
    queryKey: ['external-sets', gameId],
    queryFn: async (): Promise<ExternalSet[]> => {
      if (!gameId) return [];
      
      let query = tcgLjyClient
        .from('sets')
        .select('id, name, game_id, release_date');
      
      // Try game_id first, fallback to id if needed
      query = query.eq('game_id', gameId);
      
      const { data, error } = await query.order('release_date', { ascending: false, nullsFirst: false })
        .order('name');
      
      if (error) {
        console.error('Error fetching external sets:', error);
        throw error;
      }
      
      return data || [];
    },
    enabled: !!gameId,
    staleTime: 5 * 60 * 1000,
  });
};

// Card search hook
export const useExternalCardSearch = (nameQuery: string, numberQuery?: string, filters: SearchFilters = {}) => {
  const { gameId, setId, rarity, page = 1, pageSize = 24 } = filters;
  
  return useQuery({
    queryKey: ['external-card-search', nameQuery, numberQuery, gameId, setId, rarity, page, pageSize],
    queryFn: async (): Promise<{ cards: ExternalCard[], totalCount: number }> => {
      if (!nameQuery || nameQuery.length < 2) {
        return { cards: [], totalCount: 0 };
      }
      
      let dbQuery = tcgLjyClient
        .from('cards')
        .select(`
          id,
          name,
          number,
          rarity,
          image_url,
          game_id,
          set_id,
          sets!inner(name, game_id),
          games!inner(name)
        `);
      
      // Build search conditions - AND logic for name and number
      let searchConditions = [];
      
      // Always search by name
      searchConditions.push(`name.ilike.%${nameQuery}%`);
      
      // Add number filter if provided
      if (numberQuery && numberQuery.trim()) {
        searchConditions.push(`number.ilike.%${numberQuery.trim()}%`);
      }
      
      // Apply search conditions (AND logic)
      if (searchConditions.length > 1) {
        // Use AND logic by applying each condition separately
        dbQuery = dbQuery.ilike('name', `%${nameQuery}%`);
        if (numberQuery && numberQuery.trim()) {
          dbQuery = dbQuery.ilike('number', `%${numberQuery.trim()}%`);
        }
      } else {
        // Single condition
        dbQuery = dbQuery.ilike('name', `%${nameQuery}%`);
      }
      
      // Apply filters
      if (gameId) {
        dbQuery = dbQuery.eq('game_id', gameId);
      }
      if (setId) {
        dbQuery = dbQuery.eq('set_id', setId);
      }
      if (rarity) {
        dbQuery = dbQuery.eq('rarity', rarity);
      }
      
      // Order by relevance (exact matches first, then prefix matches, then contains)
      dbQuery = dbQuery.order('name');
      
      // Pagination - increase page size when number is provided for better results
      const adjustedPageSize = numberQuery && numberQuery.trim() ? 50 : pageSize;
      const from = (page - 1) * adjustedPageSize;
      const to = from + adjustedPageSize - 1;
      dbQuery = dbQuery.range(from, to);
      
      const { data, error, count } = await dbQuery;
      
      if (error) {
        console.error('Error searching external cards:', error);
        throw error;
      }
      
      // Transform data to include joined set/game names
      const cards: ExternalCard[] = (data || []).map((card: any) => ({
        id: card.id,
        name: card.name,
        number: card.number,
        rarity: card.rarity,
        image_url: card.image_url,
        game_id: card.game_id,
        set_id: card.set_id,
        set_name: card.sets?.name,
        game_name: card.games?.name,
      }));
      
      return { cards, totalCount: count || 0 };
    },
    enabled: nameQuery.length >= 2,
    staleTime: 30 * 1000, // 30 seconds for search results
  });
};

// Card prices hook
export const useExternalCardPrices = (cardIds: string[]) => {
  return useQuery({
    queryKey: ['external-card-prices', cardIds.sort().join(',')],
    queryFn: async (): Promise<Record<string, ExternalPrice>> => {
      if (!cardIds.length) return {};
      
      const { data, error } = await tcgLjyClient
        .from('card_prices')
        .select('*')
        .in('card_id', cardIds)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching external card prices:', error);
        return {};
      }
      
      // Group by card_id, taking the most recent price for each
      const priceMap: Record<string, ExternalPrice> = {};
      (data || []).forEach((price: ExternalPrice) => {
        if (!priceMap[price.card_id]) {
          priceMap[price.card_id] = price;
        }
      });
      
      return priceMap;
    },
    enabled: cardIds.length > 0,
    staleTime: 60 * 1000, // 1 minute for prices
  });
};

// Realtime subscriptions for cards and prices
export const useExternalRealtime = (cardIds: string[], enabled: boolean = true) => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    if (!enabled || !cardIds.length) return;
    
    // Subscribe to card changes
    const cardChannel = tcgLjyClient
      .channel('external-cards')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cards',
        },
        (payload) => {
          console.log('External card change:', payload);
          // Invalidate card search queries
          queryClient.invalidateQueries({ queryKey: ['external-card-search'] });
        }
      )
      .subscribe();
    
    // Subscribe to price changes for visible cards
    const priceChannel = tcgLjyClient
      .channel('external-prices')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'card_prices',
          filter: `card_id=in.(${cardIds.join(',')})`,
        },
        (payload) => {
          console.log('External price change:', payload);
          // Invalidate price queries
          queryClient.invalidateQueries({ queryKey: ['external-card-prices'] });
        }
      )
      .subscribe();
    
    return () => {
      tcgLjyClient.removeChannel(cardChannel);
      tcgLjyClient.removeChannel(priceChannel);
    };
  }, [cardIds.join(','), enabled, queryClient]);
};

// Distinct rarities hook for filters
export const useExternalRarities = (gameId?: string) => {
  return useQuery({
    queryKey: ['external-rarities', gameId],
    queryFn: async (): Promise<string[]> => {
      let query = tcgLjyClient
        .from('cards')
        .select('rarity');
      
      if (gameId) {
        query = query.eq('game_id', gameId);
      }
      
      const { data, error } = await query.not('rarity', 'is', null);
      
      if (error) {
        console.error('Error fetching rarities:', error);
        return [];
      }
      
      // Get distinct rarities
      const rarities = [...new Set((data || []).map(card => card.rarity).filter(Boolean))];
      return rarities.sort();
    },
    enabled: !!gameId,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};