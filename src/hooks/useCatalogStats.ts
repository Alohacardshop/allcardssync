import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'

function normalizeGameSlug(g: string) {
  if (!g) return ''
  const x = g.toLowerCase()
  if (x === 'pokemon_japan') return 'pokemon-japan'
  if (x === 'mtg') return 'magic-the-gathering'
  return x
}

export type CatalogStats = {
  sets_count: number
  cards_count: number
  pending_count: number
}

async function getCatalogStatsRaw(game: string): Promise<CatalogStats> {
  const normalized = normalizeGameSlug(game)
  const { data, error } = await supabase.rpc('catalog_v2_stats', { game_in: normalized })
  if (error) throw error
  
  const row = Array.isArray(data) ? data[0] : data
  return {
    sets_count: Number(row?.sets_count ?? 0),
    cards_count: Number(row?.cards_count ?? 0),
    pending_count: Number(row?.pending_count ?? 0),
  }
}

export function useCatalogStats(game: string) {
  const normalized = normalizeGameSlug(game)
  
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['catalog_v2_stats', normalized],
    queryFn: () => getCatalogStatsRaw(normalized),
    enabled: !!game,
    staleTime: 2 * 60 * 1000, // 2 minutes
    refetchOnWindowFocus: false,
  })

  return { data, error, isLoading, mutate: refetch, game: normalized }
}