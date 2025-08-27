// Simplified types for components that need basic JustTCG data structures
// All API calls now go through Supabase Edge Functions

export type JustTCGCard = {
  id?: string;
  name?: string;
  number?: string | number;
  set?: string;
  tcgplayerId?: string | number;
  images?: { small?: string; large?: string };
};

// For components that need to search cards via edge functions
export async function searchCatalogV2(game: 'pokemon'|'pokemon_japan'|'mtg', name: string, number?: string, limit = 5) {
  const url = new URL(`https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-search`);
  url.searchParams.set("game", game);
  url.searchParams.set("name", name);
  if (number) url.searchParams.set("number", number);
  url.searchParams.set("limit", String(limit));
  
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(await res.text());
  const { data } = await res.json();
  return data as Array<{ 
    id: string; 
    game: string; 
    name: string; 
    number?: string; 
    set?: { name?: string }; 
    images?: { small?: string }; 
    tcgplayer_product_id?: number 
  }>;
}

// For components that need to get prices via edge functions
export async function getReferencePriceByTcgplayerId(
  tcgplayerId: string | number,
  opts?: { condition?: string; printing?: string }
) {
  const url = new URL(`https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg/cards`);
  url.searchParams.set("tcgplayerId", String(tcgplayerId));
  if (opts?.condition) url.searchParams.set("condition", opts.condition);
  if (opts?.printing) url.searchParams.set("printing", opts.printing);
  
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const response = await res.json();
  const cards = response.data?.data || response.data || [];
  return (cards?.[0]?.variants || []);
}

// For components that need to search by name via edge functions  
export async function searchCardsByNameNumber(params: {
  name: string;
  number?: string;
  game?: string;
  set?: string;
  limit?: number;
}): Promise<JustTCGCard[]> {
  const url = new URL(`https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/justtcg/cards`);
  
  if (params.name) url.searchParams.set("name", params.name);
  if (params.number) url.searchParams.set("number", params.number);
  if (params.game) url.searchParams.set("game", params.game);
  if (params.set) url.searchParams.set("set", params.set);
  url.searchParams.set("limit", String(params.limit ?? 5));

  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) throw new Error(await res.text());
  const response = await res.json();
  const cards = response.data?.data || response.data || [];
  
  // Filter out sealed products and improve quality
  return cards.filter((card: any) => {
    const name = card.name?.toLowerCase() || '';
    return !name.includes('booster') && 
           !name.includes('box') && 
           !name.includes('pack') &&
           !name.includes('sealed') &&
           card.name !== 'N/A';
  });
}