// JustTCG API Types

export interface ApiMetadata {
  apiRequestsUsed: number;
  apiRequestsRemaining: number;
  apiRateLimit: number;
  resetTime?: string;
  timing?: {
    total?: number;
    api?: number;
    processing?: number;
  };
}

export interface SyncResult {
  setsProcessed?: number;
  cardsProcessed: number;
  variantsProcessed: number;
  skipped?: number;
  errors?: number;
  message?: string;
  _metadata?: ApiMetadata;
}

export interface RefreshListRequest {
  game: string;
  set?: string;
  orderBy?: 'price' | '24h' | '7d' | '30d';
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface RefreshIdRequest {
  ids: string[];
  cardSortBy?: string;
  cardSortOrder?: 'asc' | 'desc';
  variantSortBy?: string;
  variantSortOrder?: 'asc' | 'desc';
}

export interface RefreshResult {
  mode: 'list' | 'id';
  idsRequested?: number;
  game?: string;
  set?: string;
  cardsProcessed: number;
  variantsProcessed: number;
  orderBy?: string;
  cardSortBy?: string;
  variantSortBy?: string;
  data?: CardResult[];
  _metadata?: ApiMetadata;
  message: string;
}

export interface CardResult {
  id: string;
  name: string;
  set?: {
    name?: string;
  };
  images?: {
    small?: string;
  };
  tcgplayer_product_id?: number;
  variants?: VariantResult[];
}

export interface VariantResult {
  id?: string;
  language?: string;
  printing?: string;
  condition?: string;
  price?: number;
  market_price?: number;
  low_price?: number;
  mid_price?: number;
  high_price?: number;
  currency?: string;
}

export interface AnalyticsSnapshot {
  id: number;
  captured_at: string;
  game: string;
  card_id: string;
  card_name: string;
  cheapest_price: number;
  change_24h: number;
  change_7d: number;
  change_30d: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  message: string;
  service?: string;
  operation?: string;
  [key: string]: any;
}

export type GameType = 'magic-the-gathering' | 'pokemon' | 'pokemon-japan';
export type OrderByType = 'price' | '24h' | '7d' | '30d';
export type SortOrderType = 'asc' | 'desc';
export type MetricType = 'change_24h' | 'change_7d' | 'change_30d' | 'cheapest_price';