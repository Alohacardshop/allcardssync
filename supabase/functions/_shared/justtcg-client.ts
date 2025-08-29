// JustTCG API Client with retry logic and rate limiting
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

export class JustTCGClient {
  private baseUrl = 'https://api.justtcg.com/v1';
  private apiKey: string;
  private requestCount = 0;
  private lastRequestTime = 0;
  private minDelayMs = 1000; // 1 second between requests

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  // Rate limiting - ensure minimum delay between requests
  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.minDelayMs) {
      const waitTime = this.minDelayMs - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  // Exponential backoff retry logic
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    maxRetries = 3
  ): Promise<Response> {
    await this.rateLimit();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        // Handle rate limits with exponential backoff
        if (response.status === 429) {
          if (attempt === maxRetries) {
            throw new Error(`Rate limited after ${maxRetries + 1} attempts`);
          }

          const retryAfter = response.headers.get('Retry-After');
          const delay = retryAfter 
            ? parseInt(retryAfter) * 1000 
            : Math.min(2000 * Math.pow(2, attempt), 30000); // Exponential backoff, max 30s

          console.log(`Rate limited, waiting ${delay}ms before retry ${attempt + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Handle other errors
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }

        // Network errors get exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Network error, retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Max retries exceeded');
  }

  async getGames(): Promise<JustTCGGame[]> {
    const response = await this.fetchWithRetry(`${this.baseUrl}/games`);
    const data = await response.json();
    return data.data || [];
  }

  async *getSets(game: string): AsyncGenerator<JustTCGSet[], void, unknown> {
    let cursor: PaginationCursor = { page: 1 };
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/sets`);
      if (cursor.page) url.searchParams.set('page', cursor.page.toString());
      if (cursor.cursor) url.searchParams.set('cursor', cursor.cursor);

      const response = await this.fetchWithRetry(url.toString());
      const data = await response.json();
      
      const sets = data.data || [];
      if (sets.length === 0) break;

      yield sets;

      // Update cursor for next page
      cursor = {
        page: cursor.page ? cursor.page + 1 : 1,
        cursor: data.next_cursor,
        has_more: data.has_more ?? (sets.length === 50) // Assume more if full page
      };

      if (!cursor.has_more) break;
    }
  }

  async *getCards(game: string, setId: string): AsyncGenerator<JustTCGCard[], void, unknown> {
    let cursor: PaginationCursor = { page: 1 };
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/sets/${setId}/cards`);
      if (cursor.page) url.searchParams.set('page', cursor.page.toString());
      if (cursor.cursor) url.searchParams.set('cursor', cursor.cursor);

      const response = await this.fetchWithRetry(url.toString());
      const data = await response.json();
      
      const cards = data.data || [];
      if (cards.length === 0) break;

      yield cards;

      // Update cursor for next page
      cursor = {
        page: cursor.page ? cursor.page + 1 : 1,
        cursor: data.next_cursor,
        has_more: data.has_more ?? (cards.length === 50)
      };

      if (!cursor.has_more) break;
    }
  }

  async *getVariants(game: string, cardId: string): AsyncGenerator<JustTCGVariant[], void, unknown> {
    let cursor: PaginationCursor = { page: 1 };
    
    while (cursor.has_more !== false) {
      const url = new URL(`${this.baseUrl}/games/${game}/cards/${cardId}/variants`);
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
        has_more: data.has_more ?? (variants.length === 50)
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

  resetRequestCount(): void {
    this.requestCount = 0;
  }
}