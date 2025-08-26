import { supabase } from '@/integrations/supabase/client';

const FUNCTIONS_BASE = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1`;

export interface GameMode {
  value: string;
  label: string;
  game: string;
  filterJapanese?: boolean;
}

export const GAME_MODES: GameMode[] = [
  {
    value: 'mtg',
    label: 'Magic: The Gathering',
    game: 'mtg'
  },
  {
    value: 'pokemon-all',
    label: 'Pokémon (All)',
    game: 'pokemon',
    filterJapanese: false
  },
  {
    value: 'pokemon-jp',
    label: 'Pokémon (Japanese Only)',
    game: 'pokemon',
    filterJapanese: true
  }
];

export interface CatalogStats {
  sets_count: number;
  cards_count: number;
  pending_sets: number;
}

export interface QueueStats {
  queued: number;
  processing: number;
  done: number;
  error: number;
}

export interface SyncError {
  set_id: string;
  card_id: string;
  step: string;
  message: string;
  created_at: string;
}

export interface HealthStatus {
  ok: boolean;
  api: string;
  reason?: string;
  details?: any;
}

export interface SyncResult {
  ok: boolean;
  error?: string;
  queued_sets?: number;
  cards?: number;
  setId?: string;
  mode?: string;
  at: string;
}

// Health check
export async function checkHealth(): Promise<HealthStatus> {
  const response = await fetch(`${FUNCTIONS_BASE}/catalog-sync/health`);
  return response.json();
}

// Get catalog stats for a game
export async function getCatalogStats(mode: GameMode): Promise<CatalogStats> {
  const { data, error } = await supabase.rpc('catalog_v2_stats', { 
    game_in: mode.game 
  });
  
  if (error) throw error;
  
  const row = Array.isArray(data) ? data[0] : data;
  return {
    sets_count: Number(row?.sets_count ?? 0),
    cards_count: Number(row?.cards_count ?? 0),
    pending_sets: Number(row?.pending_sets ?? 0),
  };
}

// Get queue stats by mode
export async function getQueueStatsByMode(mode: GameMode): Promise<QueueStats> {
  const modeParam = mode.value === 'pokemon-jp' ? 'pokemon-jp' : 
                   mode.value === 'pokemon-all' ? 'pokemon-all' : 'mtg';
  
  const { data, error } = await supabase.rpc('catalog_v2_queue_stats_by_mode', { 
    mode_in: modeParam
  });
  
  if (error) throw error;
  
  const row = Array.isArray(data) ? data[0] : data;
  return {
    queued: Number(row?.queued ?? 0),
    processing: Number(row?.processing ?? 0),
    done: Number(row?.done ?? 0),
    error: Number(row?.error ?? 0),
  };
}

// Get recent sync errors
export async function getRecentSyncErrors(mode: GameMode, limit: number = 5): Promise<SyncError[]> {
  const { data, error } = await supabase.rpc('catalog_v2_get_recent_sync_errors', {
    game_in: mode.game,
    limit_in: limit
  });
  
  if (error) throw error;
  return data || [];
}

// Run sync operation
export async function runSync(mode: GameMode, options: { setId?: string; since?: string } = {}): Promise<SyncResult> {
  const url = new URL(`${FUNCTIONS_BASE}/catalog-sync`);
  url.searchParams.set('game', mode.game);
  
  if (mode.filterJapanese) {
    url.searchParams.set('filterJapanese', 'true');
  }
  
  if (options.setId) url.searchParams.set('setId', options.setId);
  if (options.since) url.searchParams.set('since', options.since);

  const response = await fetch(url.toString(), { method: 'POST' });
  const data = await response.json();
  
  return { 
    ok: response.ok, 
    ...data, 
    at: new Date().toISOString() 
  };
}

// Queue pending sets for a mode
export async function queuePendingSets(mode: GameMode): Promise<number> {
  const modeParam = mode.value === 'pokemon-jp' ? 'pokemon-jp' : 
                   mode.value === 'pokemon-all' ? 'pokemon-all' : 'mtg';
  
  const { data, error } = await supabase.rpc('catalog_v2_queue_pending_sets_by_mode', {
    mode_in: modeParam,
    game_in: mode.game,
    filter_japanese: mode.filterJapanese || false
  });
  
  if (error) throw error;
  return data ?? 0;
}

// Drain queue (process next item)
export async function drainQueue(mode: GameMode): Promise<SyncResult> {
  const url = new URL(`${FUNCTIONS_BASE}/catalog-sync/drain`);
  url.searchParams.set('game', mode.game);
  
  if (mode.filterJapanese) {
    url.searchParams.set('filterJapanese', 'true');
  }

  const response = await fetch(url.toString(), { method: 'POST' });
  const data = await response.json();
  
  return {
    ok: response.ok,
    ...data,
    at: new Date().toISOString()
  };
}

// Audit interfaces
export interface AuditTotals {
  sets_upstream: number;
  sets_local: number;
  sets_missing: number;
  cards_upstream: number;
  cards_local: number;
  cards_missing: number;
  variants_upstream: number;
  variants_local: number;
  variants_missing: number;
  variants_stale: number;
}

export interface AuditResult {
  mode: string;
  scope: string;
  totals: AuditTotals;
  sampleMissing: {
    sets: string[];
    cards: string[];
    variants: string[];
  };
  nextActions: string[];
}

// Run audit
export async function runAudit(mode: GameMode, options: { setId?: string; exportFormat?: 'json' | 'csv' } = {}): Promise<AuditResult | string> {
  const url = new URL(`${FUNCTIONS_BASE}/catalog-audit`);
  url.searchParams.set('game', mode.game);
  
  if (mode.filterJapanese) {
    url.searchParams.set('filterJapanese', 'true');
  }
  
  if (options.setId) url.searchParams.set('setId', options.setId);
  if (options.exportFormat) url.searchParams.set('exportFormat', options.exportFormat);

  const response = await fetch(url.toString(), { method: 'POST' });
  
  if (options.exportFormat === 'csv') {
    return response.text();
  }
  
  return response.json();
}

// Fix set (run sync and return result)
export async function fixSet(mode: GameMode, setId: string): Promise<SyncResult> {
  return runSync(mode, { setId });
}

// Data browser interfaces
export interface CatalogSet {
  set_id: string;
  name: string;
  release_date: string | null;
  total: number | null;
  last_seen_at: string;
  cards_count?: number;
}

export interface CatalogCard {
  card_id: string;
  set_id: string;
  name: string;
  number: string | null;
  rarity: string | null;
  supertype: string | null;
  last_seen_at: string;
}

export interface CatalogVariant {
  variant_key: string;
  card_id: string;
  language: string | null;
  printing: string | null;
  condition: string | null;
  sku: string | null;
  price: number | null;
  market_price: number | null;
  currency: string;
  last_seen_at: string;
}

export interface DataFilters {
  search?: string;
  setId?: string;
  rarity?: string;
  language?: string;
  printing?: string;
  condition?: string;
  priceMin?: number;
  priceMax?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Fetch catalog sets
export async function getCatalogSets(mode: GameMode, filters: DataFilters = {}): Promise<PaginatedResponse<CatalogSet>> {
  const { data, error } = await supabase.rpc('catalog_v2_browse_sets', {
    game_in: mode.game,
    filter_japanese: mode.filterJapanese || false,
    search_in: filters.search || null,
    sort_by: filters.sortBy || 'set_id',
    sort_order: filters.sortOrder || 'asc',
    page_in: filters.page || 1,
    limit_in: filters.limit || 50
  });
  
  if (error) throw error;
  
  const result = Array.isArray(data) ? data[0] : data;
  return {
    data: result?.sets || [],
    total: result?.total_count || 0,
    page: filters.page || 1,
    limit: filters.limit || 50,
    totalPages: Math.ceil((result?.total_count || 0) / (filters.limit || 50))
  };
}

// Fetch catalog cards
export async function getCatalogCards(mode: GameMode, filters: DataFilters = {}): Promise<PaginatedResponse<CatalogCard>> {
  const { data, error } = await supabase.rpc('catalog_v2_browse_cards', {
    game_in: mode.game,
    filter_japanese: mode.filterJapanese || false,
    search_in: filters.search || null,
    set_id_in: filters.setId || null,
    rarity_in: filters.rarity || null,
    sort_by: filters.sortBy || 'card_id',
    sort_order: filters.sortOrder || 'asc',
    page_in: filters.page || 1,
    limit_in: filters.limit || 50
  });
  
  if (error) throw error;
  
  const result = Array.isArray(data) ? data[0] : data;
  return {
    data: result?.cards || [],
    total: result?.total_count || 0,
    page: filters.page || 1,
    limit: filters.limit || 50,
    totalPages: Math.ceil((result?.total_count || 0) / (filters.limit || 50))
  };
}

// Fetch catalog variants
export async function getCatalogVariants(mode: GameMode, filters: DataFilters = {}): Promise<PaginatedResponse<CatalogVariant>> {
  const { data, error } = await supabase.rpc('catalog_v2_browse_variants', {
    game_in: mode.game,
    filter_japanese: mode.filterJapanese || false,
    search_in: filters.search || null,
    set_id_in: filters.setId || null,
    language_in: filters.language || null,
    printing_in: filters.printing || null,
    condition_in: filters.condition || null,
    price_min: filters.priceMin || null,
    price_max: filters.priceMax || null,
    sort_by: filters.sortBy || 'variant_key',
    sort_order: filters.sortOrder || 'asc',
    page_in: filters.page || 1,
    limit_in: filters.limit || 50
  });
  
  if (error) throw error;
  
  const result = Array.isArray(data) ? data[0] : data;
  return {
    data: result?.variants || [],
    total: result?.total_count || 0,
    page: filters.page || 1,
    limit: filters.limit || 50,
    totalPages: Math.ceil((result?.total_count || 0) / (filters.limit || 50))
  };
}

// Utility functions
export function getIncrementalDate(months: number = 6): string {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().split('T')[0];
}

export function formatTimeAgo(timestamp: string | null): string {
  if (!timestamp) return "—";
  
  const now = Date.now();
  const time = new Date(timestamp).getTime();
  const secondsAgo = Math.floor((now - time) / 1000);
  
  if (secondsAgo < 60) return `${secondsAgo}s ago`;
  
  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) return `${minutesAgo}m ago`;
  
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo}h ago`;
  
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}