import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

function normalizeGameSlug(g: string) {
  if (!g) return ''
  const x = g.toLowerCase()
  if (x === 'pokemon_japan') return 'pokemon-japan'
  if (x === 'mtg') return 'magic-the-gathering'
  return x
}

export interface CatalogSet {
  set_id: string
  name: string
  release_date?: string
  total?: number
  cards_count: number
  last_seen_at?: string
}

export interface CatalogCard {
  card_id: string
  set_id: string
  name: string
  number?: string
  rarity?: string
  supertype?: string
  last_seen_at?: string
}

// Hook for browsing sets
export function useCatalogSets(
  game: string,
  options: {
    search?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  } = {}
) {
  const normalized = normalizeGameSlug(game)
  
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['catalog_v2_browse_sets', normalized, options],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('catalog_v2_browse_sets', {
        game_in: normalized,
        filter_japanese: false,
        search_in: options.search || null,
        sort_by: options.sortBy || 'set_id',
        sort_order: options.sortOrder || 'asc',
        page_in: options.page || 1,
        limit_in: options.limit || 50
      })
      
      if (error) throw error
      
      const result = data as any
      return {
        sets: (result?.sets || []) as CatalogSet[],
        total_count: result?.total_count || 0
      }
    },
    enabled: !!game,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  })

  return { 
    data: data?.sets || [], 
    totalCount: data?.total_count || 0,
    error, 
    isLoading, 
    refetch 
  }
}

// Hook for browsing cards
export function useCatalogCards(
  game: string,
  options: {
    search?: string
    setId?: string
    rarity?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
    page?: number
    limit?: number
  } = {}
) {
  const normalized = normalizeGameSlug(game)
  
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['catalog_v2_browse_cards', normalized, options],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('catalog_v2_browse_cards', {
        game_in: normalized,
        filter_japanese: false,
        search_in: options.search || null,
        set_id_in: options.setId || null,
        rarity_in: options.rarity || null,
        sort_by: options.sortBy || 'card_id',
        sort_order: options.sortOrder || 'asc',
        page_in: options.page || 1,
        limit_in: options.limit || 50
      })
      
      if (error) throw error
      
      const result = data as any
      return {
        cards: (result?.cards || []) as CatalogCard[],
        total_count: result?.total_count || 0
      }
    },
    enabled: !!game,
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: false,
  })

  return { 
    data: data?.cards || [], 
    totalCount: data?.total_count || 0,
    error, 
    isLoading, 
    refetch 
  }
}