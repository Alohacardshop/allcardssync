import { supabase } from '@/integrations/supabase/client';
import type { GameKey, JObjectCard, Printing } from '@/lib/types';

const BASE_URL = 'https://api.justtcg.com/v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache
const cache = new Map<string, { exp: number; data: any }>();

async function getApiKey(): Promise<string> {
  const { data, error } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', 'JUSTTCG_API_KEY')
    .single();
  
  if (error || !data?.key_value) {
    throw new Error('JustTCG API key not configured. Please contact admin.');
  }
  return data.key_value;
}

async function jfetch<T>(endpoint: string, init?: RequestInit): Promise<T> {
  const apiKey = await getApiKey();
  const url = `${BASE_URL}${endpoint}`;
  const cacheKey = `${url}:${JSON.stringify(init?.body || {})}`;
  const now = Date.now();

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && cached.exp > now) return cached.data as T;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    ...(init?.headers || {}),
  };

  // Retry logic
  let attempt = 0;
  let lastError: any;
  
  while (attempt < 3) {
    try {
      const response = await fetch(url, { ...init, headers });
      
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP ${response.status}: Rate limited or server error`);
      }
      
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }
      
      const data = await response.json() as T;
      cache.set(cacheKey, { exp: now + CACHE_TTL_MS, data });
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
      attempt++;
    }
  }
  
  throw lastError;
}

function normalizeGameParam(game: GameKey): string {
  const gameMap: Record<GameKey, string> = {
    pokemon: 'Pokemon',
    pokemon_japan: 'Pokemon Japan',
    mtg: 'Magic: The Gathering',
  };
  return gameMap[game];
}

export async function searchCards(params: {
  name?: string;
  number?: string;
  game: GameKey;
}): Promise<{ data: JObjectCard[] }> {
  const searchParams = new URLSearchParams();
  if (params.name) searchParams.set('name', params.name);
  if (params.number) searchParams.set('number', params.number);
  searchParams.set('game', normalizeGameParam(params.game));
  
  return jfetch<{ data: JObjectCard[] }>(`/cards?${searchParams.toString()}`);
}

export async function getCardByTCGPlayerId(
  tcgplayerId: string,
  options?: { condition?: string; printing?: Printing; game?: GameKey }
): Promise<{ data: JObjectCard[] }> {
  const searchParams = new URLSearchParams({ tcgplayerId });
  if (options?.condition) searchParams.set('condition', options.condition);
  if (options?.printing) searchParams.set('printing', options.printing);
  if (options?.game) searchParams.set('game', normalizeGameParam(options.game));
  
  return jfetch<{ data: JObjectCard[] }>(`/cards?${searchParams.toString()}`);
}