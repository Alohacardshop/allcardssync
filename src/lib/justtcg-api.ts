// JustTCG API Utilities

import { supabase } from '@/integrations/supabase/client';
import type { 
  SyncResult, 
  RefreshResult, 
  RefreshListRequest, 
  RefreshIdRequest,
  GameType,
  AnalyticsSnapshot,
  LogEntry,
  ApiMetadata
} from '@/types/justtcg';

const FUNCTIONS_BASE = 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1';

// Fresh JustTCG Import Functions
export interface ImportResult {
  success: boolean;
  gamesProcessed: number;
  setsProcessed: number;
  cardsProcessed: number;
  variantsProcessed: number;
  details: Array<{
    game: string;
    set: string;
    cards: number;
    variants: number;
  }>;
}

export interface JustTCGStats {
  totalGames: number;
  totalSets: number;
  totalCards: number;
  lastSyncTime: string | null;
}

class JustTCGApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'JustTCGApiError';
  }
}

// Game type mapping to match catalog-sync function expectations
const GAME_TYPE_MAP = {
  'magic-the-gathering': 'mtg',
  'pokemon': 'pokemon',
  'pokemon-japan': 'pokemon-japan'
} as const;

// New Fresh Import Functions
export async function importAllGames(): Promise<ImportResult> {
  const response = await fetch(`${FUNCTIONS_BASE}/justtcg-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function importSingleGame(gameId: string): Promise<ImportResult> {
  const response = await fetch(`${FUNCTIONS_BASE}/justtcg-import?game=${encodeURIComponent(gameId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function importSpecificSet(gameId: string, setId: string): Promise<ImportResult> {
  const response = await fetch(
    `${FUNCTIONS_BASE}/justtcg-import?game=${encodeURIComponent(gameId)}&setId=${encodeURIComponent(setId)}`, 
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function getJustTCGStats(): Promise<JustTCGStats> {
  // Get games count
  const { count: gamesCount } = await supabase.from('justtcg_games').select('*', { count: 'exact', head: true });
  
  // Use simple approach - get counts by querying the functions directly
  let totalSets = 0;
  let totalCards = 0;
  
  try {
    // Try to get Pokemon stats as example
    const { data: pokemonStats } = await supabase.rpc('catalog_v2_stats', { game_in: 'pokemon' });
    if (pokemonStats?.[0]) {
      totalSets += pokemonStats[0].sets_count || 0;
      totalCards += pokemonStats[0].cards_count || 0;
    }
  } catch (e) {
    console.warn('Could not get catalog stats:', e);
  }
  
  // Get last sync time from system settings or use a fallback
  const { data: lastSyncSetting } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'LAST_JUSTTCG_SYNC')
    .maybeSingle();

  let lastSyncTime = null;
  if (lastSyncSetting?.key_value) {
    try {
      const parsed = JSON.parse(lastSyncSetting.key_value);
      lastSyncTime = parsed.timestamp;
    } catch (e) {
      lastSyncTime = lastSyncSetting.key_value;
    }
  }

  return {
    totalGames: gamesCount || 0,
    totalSets,
    totalCards,
    lastSyncTime
  };
}

export async function getAvailableGames(): Promise<Array<{ id: string; name: string }>> {
  const { data, error } = await supabase
    .from('justtcg_games')
    .select('id, name')
    .eq('active', true)
    .order('name');

  if (error) {
    throw new JustTCGApiError(`Database error: ${error.message}`);
  }

  return data || [];
}

export async function getGameSets(gameId: string): Promise<Array<{ set_id: string; name: string }>> {
  // Use a direct query with supabase.rpc to access catalog_v2 schema
  const { data, error } = await supabase.rpc('catalog_v2_browse_sets', {
    game_in: gameId,
    filter_japanese: false,
    search_in: null,
    sort_by: 'name',
    sort_order: 'asc',
    page_in: 1,
    limit_in: 1000
  });

  if (error) {
    throw new JustTCGApiError(`Database error: ${error.message}`);
  }

  // Parse the JSON response properly
  if (typeof data === 'object' && data !== null && 'sets' in data) {
    const setsData = data as any;
    const sets = setsData.sets || [];
    return sets.map((set: any) => ({
      set_id: set.set_id,
      name: set.name
    }));
  }
  
  return [];
}

// Legacy Sync functions (keeping for backward compatibility)
export async function syncGame(game: GameType): Promise<SyncResult> {
  // Map the game type to what the catalog-sync function expects
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  const endpoint = `${FUNCTIONS_BASE}/catalog-sync?game=${encodeURIComponent(mappedGame)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

// New separated sync functions
export async function syncSets(game: GameType, options?: { setId?: string; since?: string }): Promise<SyncResult> {
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
  url.searchParams.set('game', mappedGame);
  
  if (options?.setId) {
    url.searchParams.set('setId', options.setId);
  }
  if (options?.since) {
    url.searchParams.set('since', options.since);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function drainCardQueue(game: GameType): Promise<RefreshResult> {
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  const endpoint = `${FUNCTIONS_BASE}/catalog-sync/drain?mode=${encodeURIComponent(mappedGame)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

// Refresh functions
export async function refreshList(request: RefreshListRequest): Promise<RefreshResult> {
  const response = await fetch(`${FUNCTIONS_BASE}/catalog-refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function refreshById(request: RefreshIdRequest): Promise<RefreshResult> {
  const response = await fetch(`${FUNCTIONS_BASE}/catalog-refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

// Single card lookup
export async function searchCard(params: { 
  name?: string; 
  number?: string; 
  game?: string; 
  set?: string; 
  limit?: number; 
}): Promise<any> {
  const url = new URL(`${FUNCTIONS_BASE}/justtcg/cards`, window.location.origin);
  
  if (params.name) url.searchParams.set('name', params.name);
  if (params.number) url.searchParams.set('number', params.number);
  if (params.game) url.searchParams.set('game', params.game);
  if (params.set) url.searchParams.set('set', params.set);
  url.searchParams.set('limit', String(params.limit ?? 5));

  const response = await fetch(url.toString(), { method: 'GET' });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

// Queue management functions
export async function getQueueStats(game: GameType): Promise<{ queued: number; processing: number; done: number; error: number }> {
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  
  const { data, error } = await supabase.rpc('catalog_v2_queue_stats_by_mode', { 
    mode_in: mappedGame 
  });

  if (error) {
    console.warn('Failed to get queue stats:', error);
    return { queued: 0, processing: 0, done: 0, error: 0 };
  }

  return data[0] || { queued: 0, processing: 0, done: 0, error: 0 };
}

export async function drainQueueUntilEmpty(game: GameType, onProgress?: (processed: number, queued: number) => void): Promise<{ totalProcessed: number; status: 'idle' | 'error' }> {
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  let totalProcessed = 0;
  
  while (true) {
    try {
      // Check queue status first
      const stats = await getQueueStats(game);
      onProgress?.(totalProcessed, stats.queued);
      
      if (stats.queued === 0 && stats.processing === 0) {
        return { totalProcessed, status: 'idle' };
      }
      
      // Process one item
      const result = await drainCardQueue(game);
      
      // Check if the result indicates no more items to process
      if (result.message?.includes('idle') || result.message?.includes('No items')) {
        return { totalProcessed, status: 'idle' };
      }
      
      totalProcessed++;
      
      // Small delay to avoid overwhelming the system
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.error('Error draining queue:', error);
      return { totalProcessed, status: 'error' };
    }
  }
}

export async function startBackgroundProcessing(game: GameType, options?: { concurrency?: number; batches?: number; batchSize?: number }): Promise<any> {
  const mappedGame = GAME_TYPE_MAP[game as keyof typeof GAME_TYPE_MAP] || game;
  const url = new URL(`${FUNCTIONS_BASE}/catalog-turbo-worker`);
  url.searchParams.set('mode', mappedGame);
  
  if (options?.concurrency) url.searchParams.set('concurrency', String(options.concurrency));
  if (options?.batches) url.searchParams.set('batches', String(options.batches));
  if (options?.batchSize) url.searchParams.set('batchSize', String(options.batchSize));

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

// Analytics snapshots
export async function runSnapshots(): Promise<any> {
  const response = await fetch(`${FUNCTIONS_BASE}/catalog-snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new JustTCGApiError(`HTTP ${response.status}: ${errorText}`, response.status);
  }

  return response.json();
}

export async function getSnapshots(filters: {
  game?: string;
  startDate?: string;
  endDate?: string;
  metric?: string;
  limit?: number;
}): Promise<AnalyticsSnapshot[]> {
  let query = supabase
    .from('justtcg_analytics_snapshots')
    .select('*')
    .order('captured_at', { ascending: false })
    .limit(filters.limit || 100);

  if (filters.game && filters.game !== 'all') {
    query = query.eq('game', filters.game);
  }

  if (filters.startDate) {
    query = query.gte('captured_at', filters.startDate);
  }

  if (filters.endDate) {
    query = query.lte('captured_at', filters.endDate + 'T23:59:59');
  }

  const { data, error } = await query;

  if (error) {
    throw new JustTCGApiError(`Database error: ${error.message}`);
  }

  return data || [];
}

// API metadata management
export async function getCachedApiMetadata(): Promise<ApiMetadata | null> {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('key_value')
      .eq('key_name', 'JUSTTCG_API_USAGE_CACHE')
      .maybeSingle();
      
    if (data?.key_value) {
      const cached = JSON.parse(data.key_value);
      if (cached.timestamp && Date.now() - cached.timestamp < 300000) { // 5 min cache
        return cached.metadata;
      }
    }
  } catch (error) {
    console.warn('Failed to load cached metadata:', error);
  }
  
  return null;
}

export async function cacheApiMetadata(metadata: ApiMetadata): Promise<void> {
  try {
    await supabase
      .from('system_settings')
      .upsert({
        key_name: 'JUSTTCG_API_USAGE_CACHE',
        key_value: JSON.stringify({
          metadata,
          timestamp: Date.now()
        }),
        category: 'cache'
      }, { onConflict: 'key_name' });
  } catch (error) {
    console.warn('Failed to cache API metadata:', error);
  }
}

// Utility functions
export function parseIdList(input: string): string[] {
  return input
    .split(/[\n,\s]+/)
    .map(id => id.trim())
    .filter(id => id.length > 0);
}

export function formatPrice(price: number | null | undefined): string {
  if (price === null || price === undefined || isNaN(price)) return '-';
  return `$${price.toFixed(2)}`;
}

export function formatChange(change: number | null | undefined): string {
  if (change === null || change === undefined || isNaN(change)) return '-';
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(2)}%`;
}

export function getChangeColor(change: number | null | undefined): string {
  if (change === null || change === undefined || isNaN(change)) return 'text-muted-foreground';
  if (change > 0) return 'text-green-600';
  if (change < 0) return 'text-red-600';
  return 'text-muted-foreground';
}