export interface NormalizedCard {
  id: string;
  line: string;
  set: string;
  name: string;
  title: string | null;
  number: string;
  rarity: string;
  condition: string;
  marketPrice: number | null;
  directLow: number | null;
  lowWithShipping: number | null;
  lowPrice: number | null;
  marketplacePrice: number | null;
  quantity: number;
  addQuantity: number | null;
  photoUrl: string | null;
}

// Header alias mapping for both schemas
export const HEADER_ALIASES: Record<string, keyof NormalizedCard | undefined> = {
  'TCGplayer Id': 'id',
  'Product Line': 'line',
  'Set Name': 'set',
  'Product Name': 'name',
  'Title': 'title',
  'Number': 'number',
  'Rarity': 'rarity',
  'Condition': 'condition',
  'TCG Market Price': 'marketPrice',
  'TCG Direct Low': 'directLow',
  'TCG Low Price With Shipping': 'lowWithShipping',
  'TCG Low Price': 'lowPrice',
  'TCG Marketplace Price': 'marketplacePrice',
  'Total Quantity': 'quantity',
  'Add to Quantity': 'addQuantity',
  'Photo URL': 'photoUrl',
  // Alternative naming variations
  'PhotoURL': 'photoUrl',
  'Photo Url': 'photoUrl',
  'Image URL': 'photoUrl',
  'Quantity': 'quantity',
  'Card Number': 'number',
  'Card Name': 'name',
};

/**
 * Coerce string to price number or null
 */
export function coercePrice(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  
  const cleaned = value.toString().trim().replace(/[$,]/g, '');
  if (!cleaned || cleaned === '') return null;
  
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  
  // Round to 2 decimal places
  return Math.round(parsed * 100) / 100;
}

/**
 * Coerce string to integer with fallback
 */
export function coerceInt(value: string | null | undefined, fallback: number = 0): number {
  if (!value || typeof value !== 'string') return fallback;
  
  const cleaned = value.toString().trim();
  if (!cleaned || cleaned === '') return fallback;
  
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/**
 * Remap CSV row keys to normalized structure
 */
export function remapKeys(row: Record<string, string>): Partial<NormalizedCard> {
  const normalized: Partial<NormalizedCard> = {};
  
  for (const [originalKey, value] of Object.entries(row)) {
    const normalizedKey = HEADER_ALIASES[originalKey.trim()];
    if (normalizedKey) {
      if (normalizedKey === 'quantity') {
        (normalized as any)[normalizedKey] = coerceInt(value, 0);
      } else if (normalizedKey === 'addQuantity') {
        (normalized as any)[normalizedKey] = coerceInt(value) || null;
      } else if (['marketPrice', 'directLow', 'lowWithShipping', 'lowPrice', 'marketplacePrice'].includes(normalizedKey)) {
        (normalized as any)[normalizedKey] = coercePrice(value);
      } else if (normalizedKey === 'photoUrl') {
        // Basic URL validation - if it looks like a URL, keep it, otherwise null
        const trimmed = value?.trim();
        (normalized as any)[normalizedKey] = (trimmed && (trimmed.startsWith('http') || trimmed.startsWith('//'))) ? trimmed : null;
      } else {
        // String fields - trim and handle empty strings
        const trimmed = value?.trim();
        (normalized as any)[normalizedKey] = trimmed || null;
      }
    }
  }
  
  return normalized;
}

/**
 * Check if headers match expected schema patterns
 */
export function detectSchema(headers: string[]): 'full' | 'short' | 'unknown' {
  const normalizedHeaders = headers.map(h => h.trim());
  const recognizedCount = normalizedHeaders.filter(h => HEADER_ALIASES[h]).length;
  
  // Check for full schema (16 columns with optional fields)
  const hasDirectLow = normalizedHeaders.some(h => h === 'TCG Direct Low');
  const hasLowWithShipping = normalizedHeaders.some(h => h === 'TCG Low Price With Shipping');
  const hasAddQuantity = normalizedHeaders.some(h => h === 'Add to Quantity');
  const hasMarketplacePrice = normalizedHeaders.some(h => h === 'TCG Marketplace Price');
  
  if (hasDirectLow || hasLowWithShipping || hasAddQuantity || hasMarketplacePrice) {
    return 'full';
  }
  
  // Check for short schema (13 basic columns)
  const requiredShortFields = ['TCGplayer Id', 'Product Line', 'Set Name', 'Product Name', 'Number', 'Rarity', 'Condition', 'TCG Market Price', 'Total Quantity', 'Photo URL'];
  const hasRequiredShort = requiredShortFields.every(field => 
    normalizedHeaders.some(h => h === field)
  );
  
  if (hasRequiredShort || recognizedCount >= 8) {
    return 'short';
  }
  
  return 'unknown';
}

/**
 * Get list of recognized headers for error messages
 */
export function getRecognizedHeaders(): string[] {
  return Object.keys(HEADER_ALIASES).sort();
}
