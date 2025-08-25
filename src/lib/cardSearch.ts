export function normalizeStr(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeNumber(s: string): { num?: string; denom?: string } {
  const cleaned = (s || '').replace(/[^0-9/]/g, '');
  const [num, denom] = cleaned.split('/').filter(Boolean);
  return { num, denom };
}

export function includesLoose(hay: string, needle: string): boolean {
  const H = normalizeStr(hay);
  const N = normalizeStr(needle);
  return N.length > 0 && H.includes(N);
}

export function similarityScore(a: string, b: string): number {
  const A = ngrams(normalizeStr(a), 3);
  const B = ngrams(normalizeStr(b), 3);
  const intersection = A.filter(x => B.includes(x)).length;
  const union = new Set([...A, ...B]).size || 1;
  let score = intersection / union;
  if (normalizeStr(a).startsWith(normalizeStr(b))) score += 0.15;
  return score;
}

function ngrams(s: string, n: number): string[] {
  if (!s || s.length < n) return s ? [s] : [];
  const result: string[] = [];
  for (let i = 0; i <= s.length - n; i++) {
    result.push(s.slice(i, i + n));
  }
  return result;
}