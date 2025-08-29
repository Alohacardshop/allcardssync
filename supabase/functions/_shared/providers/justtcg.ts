
// deno-lint-ignore-file no-explicit-any
const BASE = "https://api.justtcg.com/v1";

export type GameSlug = "pokemon" | "pokemon-japan" | "mtg" | "magic-the-gathering" | "lorcana" | "one-piece" | "dragon-ball-super" | "flesh-and-blood" | string;

export type GameDTO = {
  id: string;
  name: string;
  active?: boolean;
  data?: any;
};

export type Cursor = { offset?: number; since?: string; etag?: string };

export function normalizeGameSlug(game: string): string {
  switch (game) {
    case "pokemon_japan":
    case "pokemon-japan":
      return "pokemon-japan";
    case "pokemon":
      return "pokemon";
    case "mtg":
    case "magic-the-gathering":
      return "magic-the-gathering";
    case "lorcana":
      return "lorcana";
    case "one-piece":
    case "one_piece":
      return "one-piece";
    case "dragon-ball-super":
    case "dragon_ball_super":
    case "dbs":
      return "dragon-ball-super";
    case "flesh-and-blood":
    case "flesh_and_blood":
    case "fab":
      return "flesh-and-blood";
    default:
      return game;
  }
}

async function fetchWithRetry(url: string, init: RequestInit, retries = 3): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, init);
      if (res.ok || res.status < 500) return res;
      if (i === retries - 1) return res;
    } catch (e) {
      if (i === retries - 1) throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
  }
  throw new Error("Max retries exceeded");
}

export async function getJustTCGApiKey(): Promise<string> {
  const k = Deno.env.get("JUSTTCG_API_KEY");
  if (!k) throw new Error("JUSTTCG_API_KEY not set");
  return k;
}

export type SetDTO = { 
  id: string; 
  code?: string; 
  name: string; 
  releaseDate?: string; 
  total?: number;
  series?: string;
  printedTotal?: number;
  images?: any;
  data?: any;
};

export type CardDTO = { 
  id: string; 
  setId: string; 
  name: string; 
  number?: string; 
  rarity?: string;
  supertype?: string;
  subtypes?: string[];
  images?: any;
  tcgplayerProductId?: number;
  tcgplayerUrl?: string;
  data?: any;
};

export type VariantDTO = { 
  id?: string; 
  cardId: string; 
  sku?: string; 
  language?: string; 
  printing?: string; 
  condition?: string;
  price?: number;
  marketPrice?: number;
  lowPrice?: number;
  midPrice?: number;
  highPrice?: number;
  currency?: string;
  data?: any;
};

export async function* pageSets(apiKey: string, game: GameSlug, cursor: Cursor = {}) {
  const normalized = normalizeGameSlug(game);
  const limit = 250;
  let offset = cursor.offset ?? 0;
  
  while (true) {
    const url = `${BASE}/sets?game=${encodeURIComponent(normalized)}&limit=${limit}&offset=${offset}`;
    const res = await fetchWithRetry(url, { 
      headers: { 
        "X-API-Key": apiKey, 
        "Content-Type": "application/json" 
      } 
    });
    
    if (!res.ok) throw new Error(`Sets API error: ${res.status} ${res.statusText}`);
    
    const json = await res.json();
    const items: SetDTO[] = json?.data ?? json?.sets ?? json ?? [];
    
    if (!items.length) break;
    
    yield { items, cursor: { offset } };
    offset += items.length;
    
    if (items.length < limit) break;
  }
}

export async function* pageCards(apiKey: string, game: GameSlug, setId: string, cursor: Cursor = {}) {
  const normalized = normalizeGameSlug(game);
  const limit = 500;
  let offset = cursor.offset ?? 0;
  
  while (true) {
    const url = `${BASE}/cards?game=${encodeURIComponent(normalized)}&set=${encodeURIComponent(setId)}&limit=${limit}&offset=${offset}`;
    const res = await fetchWithRetry(url, { 
      headers: { 
        "X-API-Key": apiKey, 
        "Content-Type": "application/json" 
      } 
    });
    
    if (!res.ok) throw new Error(`Cards API error: ${res.status} ${res.statusText}`);
    
    const json = await res.json();
    const items: CardDTO[] = json?.data ?? json?.cards ?? json ?? [];
    
    if (!items.length) break;
    
    yield { items, cursor: { offset } };
    offset += items.length;
    
    if (items.length < limit) break;
  }
}

export async function* pageVariants(apiKey: string, game: GameSlug, cardId: string, cursor: Cursor = {}) {
  const normalized = normalizeGameSlug(game);
  const limit = 500;
  let offset = cursor.offset ?? 0;
  
  while (true) {
    const url = `${BASE}/cards/${encodeURIComponent(cardId)}/variants?game=${encodeURIComponent(normalized)}&limit=${limit}&offset=${offset}`;
    const res = await fetchWithRetry(url, { 
      headers: { 
        "X-API-Key": apiKey, 
        "Content-Type": "application/json" 
      } 
    });
    
    if (!res.ok) throw new Error(`Variants API error: ${res.status} ${res.statusText}`);
    
    const json = await res.json();
    const items: VariantDTO[] = json?.data ?? json?.variants ?? json ?? [];
    
    if (!items.length) break;
    
    yield { items, cursor: { offset } };
    offset += items.length;
    
    if (items.length < limit) break;
  }
}

export async function fetchGames(apiKey: string): Promise<GameDTO[]> {
  const url = `${BASE}/games`;
  const res = await fetchWithRetry(url, { 
    headers: { 
      "X-API-Key": apiKey, 
      "Content-Type": "application/json" 
    } 
  });
  
  if (!res.ok) throw new Error(`Games API error: ${res.status} ${res.statusText}`);
  
  const json = await res.json();
  const games: GameDTO[] = json?.data ?? json?.games ?? json ?? [];
  
  return games.filter(g => g.active !== false); // Only return active games
}

export const normalizeName = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
