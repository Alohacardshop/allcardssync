// src/lib/justtcg.ts
const BASE = "https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg";

// Helper to unwrap potentially nested data from Edge Function responses
function unwrapData(response: any): any[] {
  // Handle multiple levels of nesting: { data: { data: [...] } } or { data: [...] }
  if (response?.data?.data && Array.isArray(response.data.data)) {
    return response.data.data;
  }
  if (response?.data && Array.isArray(response.data)) {
    return response.data;
  }
  if (Array.isArray(response)) {
    return response;
  }
  return [];
}

export type JustTCGVariant = {
  id: string;
  printing?: string;
  condition?: string;
  price?: number;
  lastUpdated?: number; // epoch secs
};
export type JustTCGCard = {
  id?: string;
  name?: string;
  number?: string | number;
  set?: string;
  variants?: JustTCGVariant[];
  tcgplayerId?: string | number;
};

async function postCards(payload: any[]) {
  const res = await fetch(`${BASE}/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const { data } = await res.json();
  return data as JustTCGCard[];
}

export async function getCardsByTcgplayerIds(
  ids: (string | number)[],
  opts?: { printing?: string; condition?: string }
) {
  return postCards(ids.map((tcgplayerId) => ({ tcgplayerId, ...opts })));
}

export async function getCardsByVariantIds(
  ids: (string | number)[],
  opts?: { printing?: string; condition?: string }
) {
  return postCards(ids.map((variantId) => ({ variantId, ...opts })));
}

// Search by name + number
export async function searchCardsByNameNumber(params: {
  name: string;
  number?: string;
  game?: string;     // optional (e.g., "pokemon", "magic-the-gathering")
  set?: string;      // optional (free-text set filter)
  limit?: number;    // default 5
}) {
  const url = new URL(`${BASE}/cards`);
    
  if (params.name)   url.searchParams.set("name", params.name);
  if (params.number) url.searchParams.set("number", params.number);
  if (params.game)   url.searchParams.set("game", params.game);
  if (params.set)    url.searchParams.set("set", params.set);
  url.searchParams.set("limit", String(params.limit ?? 5));

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const response = await res.json();
  const cards = unwrapData(response) as JustTCGCard[];
  
  // Filter out sealed products and improve quality
  return cards.filter(card => {
    const name = card.name?.toLowerCase() || '';
    return !name.includes('booster') && 
           !name.includes('box') && 
           !name.includes('pack') &&
           !name.includes('sealed') &&
           card.name !== 'N/A';
  });
}

export async function getReferencePriceByTcgplayerId(
  tcgplayerId: string | number,
  opts?: { condition?: string; printing?: string }
) {
  const url = new URL(`${BASE}/cards`);
    
  url.searchParams.set("tcgplayerId", String(tcgplayerId));
  if (opts?.condition) url.searchParams.set("condition", opts.condition);
  if (opts?.printing)  url.searchParams.set("printing", opts.printing);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const response = await res.json();
  const cards = unwrapData(response) as JustTCGCard[];
  return (cards?.[0]?.variants || []) as JustTCGVariant[]; // filtered variants with price
}

export async function getCardsByTcgplayerIdsChunked(
  ids: (string|number)[],
  opts?: { printing?: string; condition?: string },
  chunkSize = 200,
  concurrency = 2
) {
  const chunks: (string|number)[][] = [];
  for (let i=0; i<ids.length; i+=chunkSize) chunks.push(ids.slice(i, i+chunkSize));

  const results: JustTCGCard[] = [];
  let inFlight = 0, idx = 0;
  return await new Promise<JustTCGCard[]>((resolve, reject) => {
    const run = () => {
      while (inFlight < concurrency && idx < chunks.length) {
        const myIdx = idx++;
        inFlight++;
        getCardsByTcgplayerIds(chunks[myIdx], opts)
          .then(res => results.push(...res))
          .catch(reject)
          .finally(() => {
            inFlight--;
            if (results.length && inFlight === 0 && idx >= chunks.length) resolve(results);
            else run();
          });
      }
    };
    run();
  });
}