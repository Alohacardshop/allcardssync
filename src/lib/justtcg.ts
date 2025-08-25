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