// Shared JustTCG utilities and rate limiting
export const CONFIG = {
  RPM: 500,
  PAGE_SIZE_GET: 200,
  POST_BATCH_MAX: 100,
  MAX_CONCURRENT: 24,
  JUSTTCG_BASE: "https://api.justtcg.com/v1"
} as const;

// Global rate limiter using token bucket algorithm
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(capacity: number, refillPerMinute: number) {
    this.capacity = capacity;
    this.refillRate = refillPerMinute / (60 * 1000); // convert to per ms
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    this.refill();
    
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Wait until we can get a token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate);
    await new Promise(resolve => setTimeout(resolve, waitTime));
    return this.acquire();
  }

  private refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  getAvailableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

// Global rate limiter instance
export const rpmGate = new TokenBucket(CONFIG.RPM, CONFIG.RPM);

// Enhanced fetch with retry logic
export async function fetchJsonWithRetry(url: string, init: RequestInit = {}, retries = 5): Promise<any> {
  await rpmGate.acquire();
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, init);
      
      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      // Handle server errors with exponential backoff
      if (response.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Extract metadata if present
      const metadata = data._metadata || {};
      
      return {
        data: data.data || data,
        _metadata: metadata
      };
      
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay + jitter));
      }
    }
  }
  
  throw lastError || new Error(`Failed after ${retries} attempts`);
}

// Get cards with pagination
export async function getCardsPaged(params: {
  game: string;
  set?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
  order?: string;
}, apiKey: string): Promise<{ data: any[], _metadata: any }> {
  const limit = params.limit || CONFIG.PAGE_SIZE_GET;
  let offset = params.offset || 0;
  let allCards: any[] = [];
  let hasMore = true;
  let metadata = {};
  
  const headers = { "X-API-Key": apiKey };
  
  while (hasMore) {
    const url = new URL(`${CONFIG.JUSTTCG_BASE}/cards`);
    url.searchParams.set('game', params.game);
    if (params.set) url.searchParams.set('set', params.set);
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));
    if (params.orderBy) url.searchParams.set('orderBy', params.orderBy);
    if (params.order) url.searchParams.set('order', params.order);
    
    const response = await fetchJsonWithRetry(url.toString(), { headers });
    const cards = response.data || [];
    
    if (cards.length === 0) {
      hasMore = false;
      break;
    }
    
    allCards = allCards.concat(cards);
    hasMore = response._metadata?.hasMore || false;
    offset += limit;
    
    // Keep latest metadata
    metadata = response._metadata || {};
  }
  
  return {
    data: allCards,
    _metadata: metadata
  };
}

// Post cards by IDs in batches
export async function postCardsByIds(ids: string[], apiKey: string, orderBy?: string): Promise<{ data: any[], _metadata: any }> {
  const headers = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json"
  };
  
  let allCards: any[] = [];
  let mergedMetadata = {};
  
  // Process in batches
  for (let i = 0; i < ids.length; i += CONFIG.POST_BATCH_MAX) {
    const batch = ids.slice(i, i + CONFIG.POST_BATCH_MAX);
    
    const requestBody: any = { ids: batch };
    if (orderBy) {
      requestBody.orderBy = orderBy;
    }
    
    const response = await fetchJsonWithRetry(`${CONFIG.JUSTTCG_BASE}/cards`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });
    
    const cards = response.data || [];
    allCards = allCards.concat(cards);
    
    // Merge metadata, keeping latest values
    mergedMetadata = { ...mergedMetadata, ...response._metadata };
  }
  
  return {
    data: allCards,
    _metadata: mergedMetadata
  };
}

// Sorting helpers
type SortMetric = 'price' | '24h' | '7d' | '30d';
type SortDirection = 'asc' | 'desc';

function getVariantMetricValue(variant: any, metric: SortMetric): number {
  switch (metric) {
    case 'price':
      return variant.price || variant.marketPrice || 0;
    case '24h':
      return variant.change24h || 0;
    case '7d': 
      return variant.change7d || 0;
    case '30d':
      return variant.change30d || 0;
    default:
      return 0;
  }
}

export function sortVariants(variants: any[], sortBy: SortMetric, direction: SortDirection): any[] {
  return variants.sort((a, b) => {
    const aVal = getVariantMetricValue(a, sortBy);
    const bVal = getVariantMetricValue(b, sortBy);
    
    if (direction === 'desc') {
      return bVal - aVal;
    }
    return aVal - bVal;
  });
}

export function sortCards(cards: any[], sortBy: SortMetric, direction: SortDirection): any[] {
  return cards.sort((a, b) => {
    const aVariants = a.variants || [];
    const bVariants = b.variants || [];
    
    // Get aggregated metric (min by default for pricing)
    const aValues = aVariants.map((v: any) => getVariantMetricValue(v, sortBy)).filter((val: number) => val > 0);
    const bValues = bVariants.map((v: any) => getVariantMetricValue(v, sortBy)).filter((val: number) => val > 0);
    
    const aVal = aValues.length > 0 ? Math.min(...aValues) : 0;
    const bVal = bValues.length > 0 ? Math.min(...bValues) : 0;
    
    if (direction === 'desc') {
      return bVal - aVal;
    }
    return aVal - bVal;
  });
}

// Check if data needs updating
export function needsUpdate(item: any, lastUpdated?: string): boolean {
  if (!lastUpdated) return true;
  
  const itemTimestamp = new Date(item.lastUpdated || 0).getTime();
  const existingTimestamp = new Date(lastUpdated).getTime();
  
  return itemTimestamp > existingTimestamp;
}

// Structured logging
export function logStructured(level: 'INFO' | 'ERROR' | 'WARN', message: string, context: Record<string, any> = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: 'justtcg-lib',
    ...context
  };
  console.log(JSON.stringify(logEntry));
}
