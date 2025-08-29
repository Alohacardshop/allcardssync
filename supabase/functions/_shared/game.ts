// Shared game slug and parameter mapping utilities

export function normalizeGameSlug(g?: string): string {
  if (!g) return '';
  const x = g.toLowerCase().replace(/\s+/g, '-');
  if (x === 'pokemon_japan') return 'pokemon-japan';
  if (x === 'mtg') return 'magic-the-gathering';
  return x;
}

// What we send to the API for the 'game' query param
export function toApiGame(gameSlug: string): string {
  // API recognizes 'pokemon', 'pokemon-japan', 'magic-the-gathering'
  return normalizeGameSlug(gameSlug);
}

// Safe slug for fallback when provider_id is missing
export function safeSlug(input: string): string {
  return input.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// Normalize set name for matching
export function normalizeName(s = ''): string {
  return s.normalize('NFKD')
    .replace(/Pok[eé]mon/gi, 'pokemon')
    .replace(/^[A-Z]{1,3}\d+[a-z]?:\s*/i, '')    // strip "SV5a: "
    .replace(/\(.*?\)|\[.*?\]/g, '')              // remove brackets
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim().toLowerCase();
}