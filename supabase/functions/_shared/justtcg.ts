// Game slug and parameter mapping utilities
export function normalizeGameSlug(appGame: string): string {
  const g = (appGame || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (g === 'mtg') return 'magic-the-gathering';
  if (g === 'pokemon_japan') return 'pokemon-japan';
  return g;
}

export function toJustTCGParams(appGame: string): { game: string; region?: string } {
  const g = normalizeGameSlug(appGame);
  if (g === 'pokemon-japan') return { game: 'pokemon', region: 'japan' };
  return { game: g, region: undefined };
}

// Map raw JustTCG card/variant to our DB row shapes
export type SetRow = { 
  set_id: string; 
  game: string; 
  name?: string | null; 
  code?: string | null; 
  released_at?: string | null; 
  provider_id?: string | null;
};

export type CardRow = { 
  card_id: string; 
  set_id: string; 
  game: string; 
  name?: string | null; 
  rarity?: string | null; 
  number?: string | null; 
  tcgplayer_id?: string | null; 
};

export type VariantRow = {
  id: string; card_id: string; set_id: string; game: string;
  condition: string; printing: string; language?: string | null;
  price?: number | null; last_updated?: number | null;
  // optional analytics buckets (store as JSONB elsewhere if needed)
  priceChange24hr?: number | null;
  priceChange7d?: number | null; avgPrice7d?: number | null;
  priceChange30d?: number | null; avgPrice30d?: number | null;
  priceChange90d?: number | null; avgPrice90d?: number | null;
};

export function mapSet(game: string, s: any): SetRow {
  return { 
    set_id: s.id, 
    game, 
    name: s.name ?? null, 
    code: s.code ?? null, 
    released_at: s.releasedAt ?? null,
    provider_id: s.id // Store API identifier
  };
}

export function mapCard(game: string, c: any): CardRow {
  return {
    card_id: c.id, set_id: c.setId, game,
    name: c.name ?? null, rarity: c.rarity ?? null, number: c.number ?? null,
    tcgplayer_id: c.tcgplayerId ?? null,
  };
}

export function mapVariant(game: string, v: any): VariantRow {
  return {
    id: v.id, card_id: v.cardId, set_id: v.setId, game,
    condition: v.condition, printing: v.printing, language: v.language ?? 'English',
    price: v.price ?? null, last_updated: v.lastUpdated ?? null,
    priceChange24hr: v.priceChange24hr ?? null,
    priceChange7d: v.priceChange7d ?? null, avgPrice7d: v.avgPrice ?? null,
    priceChange30d: v.priceChange30d ?? null, avgPrice30d: v.avgPrice30d ?? null,
    priceChange90d: v.priceChange90d ?? null, avgPrice90d: v.avgPrice90d ?? null,
  };
}