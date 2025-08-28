// Shared game slug and parameter mapping utilities

export function normalizeGameSlug(g?: string): string {
  if (!g) return '';
  const x = g.toLowerCase().replace(/\s+/g, '-');
  if (x === 'pokemon_japan') return 'pokemon-japan';
  if (x === 'mtg') return 'magic-the-gathering';
  return x;
}

export function toJustTCGParams(gameIn: string): { game: string; region?: string } {
  const g = normalizeGameSlug(gameIn);
  if (g === 'pokemon-japan') return { game: 'pokemon', region: 'japan' };
  return { game: g, region: undefined };
}

// Safe slug for fallback when provider_id is missing
export function safeSlug(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}