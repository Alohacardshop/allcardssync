// Shared JustTCG utilities and type mapping

export function normalizeGameSlug(appGame: string): string {
  const g = (appGame || '').trim().toLowerCase();
  if (g === 'mtg') return 'magic-the-gathering';
  if (g === 'pokemon_japan') return 'pokemon-japan';
  return g;
}

export function toJustTCGParams(appGame: string): { game: string; region?: string } {
  const g = normalizeGameSlug(appGame);
  if (g === 'pokemon-japan') return { game: 'pokemon', region: 'japan' };
  return { game: g };
}

// DB row type definitions for catalog_v2 schema
export type SetRow = { 
  provider?: string;
  set_id: string; 
  game: string; 
  name?: string | null; 
  series?: string | null;
  printed_total?: number | null;
  total?: number | null;
  release_date?: string | null;
  images?: any | null;
  data?: any | null;
};

export type CardRow = { 
  provider?: string;
  card_id: string; 
  game: string;
  set_id: string; 
  name?: string | null; 
  number?: string | null;
  rarity?: string | null; 
  supertype?: string | null;
  subtypes?: string[] | null;
  images?: any | null;
  tcgplayer_product_id?: number | null;
  tcgplayer_url?: string | null;
  data?: any | null;
};

export type VariantRow = {
  provider?: string;
  variant_id?: string | null;
  card_id: string; 
  game: string;
  language?: string | null;
  printing?: string | null;
  condition?: string | null; 
  sku?: string | null;
  price?: number | null;
  market_price?: number | null;
  low_price?: number | null;
  mid_price?: number | null;
  high_price?: number | null;
  currency?: string | null;
  data?: any | null;
};

export function mapSet(game: string, s: any): SetRow {
  return { 
    provider: 'justtcg',
    set_id: s.id || s.set_id,
    game, 
    name: s.name || null, 
    series: s.series || null,
    printed_total: s.printedTotal || s.printed_total || null,
    total: s.total || null,
    release_date: s.releaseDate || s.released_at || null,
    images: s.images || null,
    data: s.data || s
  };
}

export function mapCard(game: string, c: any): CardRow {
  return {
    provider: 'justtcg',
    card_id: c.id || c.card_id,
    game,
    set_id: c.setId || c.set_id,
    name: c.name || null, 
    number: c.number || null,
    rarity: c.rarity || null, 
    supertype: c.supertype || null,
    subtypes: c.subtypes || null,
    images: c.images || null,
    tcgplayer_product_id: c.tcgplayerId || c.tcgplayer_product_id || null,
    tcgplayer_url: c.tcgplayerUrl || c.tcgplayer_url || null,
    data: c.data || c
  };
}

export function mapVariant(game: string, v: any): VariantRow {
  return {
    provider: 'justtcg',
    variant_id: v.id || v.variant_id || null,
    card_id: v.cardId || v.card_id,
    game,
    language: v.language || 'English',
    printing: v.printing || 'Normal',
    condition: v.condition || 'Near Mint',
    sku: v.sku || null,
    price: v.price || null,
    market_price: v.marketPrice || v.market_price || null,
    low_price: v.lowPrice || v.low_price || null,
    mid_price: v.midPrice || v.mid_price || null,
    high_price: v.highPrice || v.high_price || null,
    currency: v.currency || 'USD',
    data: v.data || v
  };
}