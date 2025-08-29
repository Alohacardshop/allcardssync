// Premium JustTCG API Client optimized for Premium plan (500 req/min, higher limits)
export interface JustTCGGame {
  id: string;
  name: string;
  active: boolean;
}

export interface JustTCGSet {
  id: string;
  name: string;
  game: string;
  total?: number;
  release_date?: string;
  images?: any;
}

export interface JustTCGCard {
  id: string;
  name: string;
  set_id: string;
  game: string;
  number?: string;
  rarity?: string;
  images?: any;
  tcgplayer_product_id?: number;
}

export interface JustTCGVariant {
  id: string;
  card_id: string;
  game: string;
  language?: string;
  printing?: string;
  condition?: string;
  price?: number;
  market_price?: number;
}

export interface PaginationCursor {
  page?: number;
  cursor?: string;
  has_more?: boolean;
}

export interface PremiumConfig {
  cardsPerRequest: number;
  setsPerRequest: number;
  variantsPerRequest: number;
  requestsPerMinute: number;
  delayBetweenCalls: number;
  apiTimeout: number;
  maxRetries: number;
}

export class JustTCGClientPremium {
  private baseUrl = 'https://api.justtcg.com/v1';
  private apiKey: string;
  private requestCount = 0;
  private requestsThisMinute = 0;
  private minuteStartTime = Date.now();
  private lastRequestTime = 0;
  private config: PremiumConfig;
  private usageCallback?: (count: number) => Promise<void>;

  constructor(
    apiKey: string, 
    config?: Partial<PremiumConfig>,
    onApiRequest?: (count: number) => Promise<void>
  ) {
    this.apiKey = apiKey;
    this.usageCallback = onApiRequest;
    
    // Premium plan defaults - 3-5x faster than standard settings
    this.config = {
      cardsPerRequest: 200,       // Max limit for premium
      setsPerRequest: 100,        // 2x increase from 50
      variantsPerRequest: 200,    // Max limit for premium
      requestsPerMinute: 400,     // Safe rate below 500 limit
      delayBetweenCalls: 150,     // 150ms = 400 req/min
      apiTimeout: 60000,          // 60 second timeout
      maxRetries: 3,
      ...config
    };

    console.log(`🚀 JustTCG Premium Client initialized:
📊 Cards per request: ${this.config.cardsPerRequest}
📊 Sets per request: ${this.config.setsPerRequest}
📊 Delay between calls: ${this.config.delayBetweenCalls}ms
📊 Rate limit: ${this.config.requestsPerMinute} req/min
⚡ Expected 3-5x performance improvement!`);
  }

  // Premium rate limiting with minute-based tracking
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    
    // Reset minute counter if needed
    if (now - this.minuteStartTime >= 60000) {
      this.requestsThisMinute = 0;
      this.minuteStartTime = now;
    }

    // Check if we need to wait for rate limit
    if (this.requestsThisMinute >= this.config.requestsPerMinute) {
      const waitTime = 60000 - (now - this.minuteStartTime);
      console.log(`⏱️  Rate limit reached, waiting ${waitTime}ms for next minute`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestsThisMinute = 0;
      this.minuteStartTime = Date.now();
    }

    // Standard delay between calls
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.config.delayBetweenCalls) {
      const waitTime = this.config.delayBetweenCalls - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
    this.requestsThisMinute++;

    // Track API usage if callback provided
    if (this.usageCallback) {
      try {
        await this.usageCallback(1);
      } catch (error) {
        console.error('Failed to track API usage:', error);
      }
    }
  }

  // Enhanced retry logic with exponential backoff
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries = this.config.maxRetries
  ): Promise<Response> {
    await this.rateLimit();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.apiTimeout);

        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle rate limits with exponential backoff
        if (response.status === 429) {
          if (attempt === maxRetries) {
            throw new Error(`Rate limited after ${maxRetries + 1} attempts`);
          }

          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter 
            ? parseInt(retryAfter) * 1000 
            : Math.min(5000 * Math.pow(2, attempt), 60000); // Max 60s backoff

          console.log(`⚠️  Rate limited (429), waiting ${delay}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Handle other errors
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.log(`⏰ Request timeout after ${this.config.apiTimeout}ms`);
        }

        if (attempt === maxRetries) {
          throw error;
        }

        // Network errors get exponential backoff
        const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
        console.log(`🔄 Network error, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async getGames(): Promise<JustTCGGame[]> {
    console.log('🎮 Fetching games with premium client...');
    const response = await this.fetchWithRetry(`${this.baseUrl}/games`);
    const data = await response.json();
    console.log(`✅ Retrieved ${data.data?.length || 0} games`);
    return data.data || [];
  }

  async *getSets(game: string): AsyncGenerator<JustTCGSet[], void, unknown> {
    console.log(`🎴 Fetching sets for ${game} (${this.config.setsPerRequest} per request)...`);
    let cursor: PaginationCursor = { page: 1 };
    let totalSets = 0;
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/sets`);
      url.searchParams.set('limit', this.config.setsPerRequest.toString());
      if (cursor.page) url.searchParams.set('page', cursor.page.toString());
      if (cursor.cursor) url.searchParams.set('cursor', cursor.cursor);

      const response = await this.fetchWithRetry(url.toString());
      const data = await response.json();
      
      const sets = data.data || [];
      if (sets.length === 0) break;

      totalSets += sets.length;
      console.log(`📊 Retrieved ${sets.length} sets (${totalSets} total) - Page ${cursor.page}`);

      yield sets;

      // Update cursor for next page
      cursor = {
        page: cursor.page ? cursor.page + 1 : 1,
        cursor: data.next_cursor,
        has_more: data.has_more ?? (sets.length === this.config.setsPerRequest)
      };

      if (!cursor.has_more) break;
    }

    console.log(`🎉 Completed sets fetch for ${game}: ${totalSets} total sets`);
  }

  async *getCards(game: string, setId: string): AsyncGenerator<JustTCGCard[], void, unknown> {
    console.log(`🃏 Fetching cards for ${game}/${setId} (${this.config.cardsPerRequest} per request)...`);
    let cursor: PaginationCursor = { page: 1 };
    let totalCards = 0;
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/sets/${setId}/cards`);
      url.searchParams.set('limit', this.config.cardsPerRequest.toString());
      if (cursor.page) url.searchParams.set('page', cursor.page.toString());
      if (cursor.cursor) url.searchParams.set('cursor', cursor.cursor);

      const response = await this.fetchWithRetry(url.toString());
      const data = await response.json();
      
      const cards = data.data || [];
      if (cards.length === 0) break;

      totalCards += cards.length;
      console.log(`📊 Retrieved ${cards.length} cards (${totalCards} total) - Page ${cursor.page}`);

      yield cards;

      cursor = {
        page: cursor.page ? cursor.page + 1 : 1,
        cursor: data.next_cursor,
        has_more: data.has_more ?? (cards.length === this.config.cardsPerRequest)
      };

      if (!cursor.has_more) break;
    }

    console.log(`🎉 Completed cards fetch for ${setId}: ${totalCards} total cards`);
  }

  async *getVariants(game: string, cardId: string): AsyncGenerator<JustTCGVariant[], void, unknown> {
    let cursor: PaginationCursor = { page: 1 };
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/cards/${cardId}/variants`);
      url.searchParams.set('limit', this.config.variantsPerRequest.toString());
      if (cursor.page) url.searchParams.set('page', cursor.page.toString());
      if (cursor.cursor) url.searchParams.set('cursor', cursor.cursor);

      const response = await this.fetchWithRetry(url.toString());
      const data = await response.json();
      
      const variants = data.data || [];
      if (variants.length === 0) break;

      yield variants;

      cursor = {
        page: cursor.page ? cursor.page + 1 : 1,
        cursor: data.next_cursor,
        has_more: data.has_more ?? (variants.length === this.config.variantsPerRequest)
      };

      if (!cursor.has_more) break;
    }
  }

  // Game slug mapping for internal consistency
  normalizeGameSlug(apiGame: string): string {
    const gameMap: Record<string, string> = {
      'magic-the-gathering': 'mtg',
      'pokemon': 'pokemon',
      'yu-gi-oh': 'yugioh',
      'dragon-ball-super': 'dbs',
      'one-piece': 'onepiece'
    };
    
    return gameMap[apiGame.toLowerCase()] || apiGame.toLowerCase();
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getRequestsThisMinute(): number {
    return this.requestsThisMinute;
  }

  getRemainingRequests(): number {
    return Math.max(0, this.config.requestsPerMinute - this.requestsThisMinute);
  }

  getPerformanceStats(): {
    totalRequests: number;
    requestsThisMinute: number;
    remainingRequests: number;
    estimatedMinutesToLimit: number;
  } {
    return {
      totalRequests: this.requestCount,
      requestsThisMinute: this.requestsThisMinute,
      remainingRequests: this.getRemainingRequests(),
      estimatedMinutesToLimit: Math.ceil(this.getRemainingRequests() / (this.config.requestsPerMinute / 60))
    };
  }

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}