// src/lib/justtcg.ts
const FUNCTIONS_BASE =
  import.meta.env.VITE_SUPABASE_FUNCTIONS_URL?.replace(/\/+$/, "") || "/functions/v1";
const BASE = `${FUNCTIONS_BASE}/justtcg`;

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
  // Handle both relative and absolute BASE URLs
  const url = BASE.startsWith('http') 
    ? new URL(`${BASE}/cards`) 
    : new URL(`${BASE}/cards`, window.location.origin);
    
  if (params.name)   url.searchParams.set("name", params.name);
  if (params.number) url.searchParams.set("number", params.number);
  if (params.game)   url.searchParams.set("game", params.game);
  if (params.set)    url.searchParams.set("set", params.set);
  url.searchParams.set("limit", String(params.limit ?? 5));

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const { data } = await res.json(); // Card[]
  return (data || []) as JustTCGCard[];
}

export async function getReferencePriceByTcgplayerId(
  tcgplayerId: string | number,
  opts?: { condition?: string; printing?: string }
) {
  // Handle both relative and absolute BASE URLs
  const url = BASE.startsWith('http') 
    ? new URL(`${BASE}/cards`) 
    : new URL(`${BASE}/cards`, window.location.origin);
    
  url.searchParams.set("tcgplayerId", String(tcgplayerId));
  if (opts?.condition) url.searchParams.set("condition", opts.condition);
  if (opts?.printing)  url.searchParams.set("printing", opts.printing);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const { data } = await res.json(); // Card[]
  return (data?.[0]?.variants || []) as JustTCGVariant[]; // filtered variants with price
}