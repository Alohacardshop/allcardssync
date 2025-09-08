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
    case 'magic-the-gathering':
      return 'MTG';
    case 'yugioh':
      return 'YGO';
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
 * Generate PSA-specific SKU using certificate number
 */
export function generatePSASKU(certNumber: string): string {
  return certNumber; // Use cert number directly as SKU
}

/**
 * Generate graded card SKU for non-PSA cards
 */
export function generateGradedSKU(company: string, grade: string, itemId: string): string {
  const sanitizedCompany = company.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const sanitizedGrade = grade.replace(/[^A-Z0-9]/g, '');
  return `${sanitizedCompany}${sanitizedGrade}-${itemId.slice(-8)}`;
}

/**
 * Generate intake item SKU
 */
export function generateIntakeSKU(itemId: string): string {
  return `intake-${itemId}`;
}

/**
 * Main SKU generation for intake items based on grading status
 */
export function generateIntakeItemSKU(
  grade?: string | null,
  psaCert?: string | null,
  existingSku?: string | null,
  itemId?: string
): string {
  const isGraded = grade && grade !== 'Raw' && grade !== 'Ungraded';
  
  if (isGraded && psaCert) {
    // For PSA graded cards: use certificate number directly
    return generatePSASKU(psaCert);
  } else if (isGraded && grade && itemId) {
    // For other graded cards: company + grade + item id
    return generateGradedSKU('GRADED', grade, itemId);
  } else if (existingSku) {
    // Use existing SKU if provided
    return existingSku;
  } else if (itemId) {
    // Fallback for raw cards
    return generateIntakeSKU(itemId);
  }
  
  // Ultimate fallback
  return `item-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
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
  if (parts.length === 2 && ['PKM', 'PKJ', 'MTG', 'YGO'].includes(parts[0])) {
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
  return parts.length === 2 && ['PKM', 'PKJ', 'MTG', 'YGO'].includes(parts[0]);
}