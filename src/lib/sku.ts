import type { GameKey } from './types';

/**
 * SKU Generation Utilities
 * Format: GAME-VariantId or GAME-FALLBACK-Random
 */

/**
 * Map game keys to abbreviations
 */
export function getGameAbbreviation(game: GameKey | string): string {
  switch (game) {
    case 'pokemon':
      return 'PKM';
    case 'pokemon_japan':
      return 'PKJ'; 
    case 'mtg':
      return 'MTG';
    default:
      return 'UNK';
  }
}

/**
 * Generate SKU from variant ID (preferred method)
 */
export function generateVariantSKU(game: GameKey | string, variantId: string): string {
  const gameAbbr = getGameAbbreviation(game);
  return `${gameAbbr}-${variantId}`;
}

/**
 * Generate fallback SKU when variant ID is not available
 */
export function generateFallbackSKU(game: GameKey | string, type: 'CARD' | 'PSA' | 'RANDOM' = 'RANDOM', identifier?: string): string {
  const gameAbbr = getGameAbbreviation(game);
  const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
  
  if (type === 'PSA' && identifier) {
    return `PSA-CERT-${identifier}`;
  }
  
  if (type === 'CARD' && identifier) {
    return `${gameAbbr}-CARD-${identifier}`;
  }
  
  // Default random format for backward compatibility
  return `${gameAbbr}-${randomSuffix}`;
}

/**
 * Main SKU generation function - tries variant ID first, falls back to other methods
 */
export function generateSKU(
  game: GameKey | string, 
  variantId?: string | null, 
  fallbackType: 'CARD' | 'PSA' | 'RANDOM' = 'RANDOM',
  fallbackIdentifier?: string
): string {
  // Prefer variant ID if available
  if (variantId) {
    return generateVariantSKU(game, variantId);
  }
  
  // Fall back to other methods
  return generateFallbackSKU(game, fallbackType, fallbackIdentifier);
}

/**
 * Extract variant ID from SKU (if present)
 */
export function extractVariantIdFromSKU(sku: string): string | null {
  if (!sku) return null;
  
  // Check if it matches variant pattern (GAME-variantId)
  const parts = sku.split('-');
  if (parts.length === 2 && ['PKM', 'PKJ', 'MTG'].includes(parts[0])) {
    // Could be variant ID - return the second part
    return parts[1];
  }
  
  return null;
}

/**
 * Validate if SKU follows variant ID format
 */
export function isVariantSKU(sku: string): boolean {
  if (!sku) return false;
  
  const parts = sku.split('-');
  return parts.length === 2 && ['PKM', 'PKJ', 'MTG'].includes(parts[0]);
}