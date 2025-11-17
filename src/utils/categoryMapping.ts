/**
 * Utility to auto-detect main category based on game/brand/subject
 * Handles special characters, unicode, and common variations from PSA/CGC APIs
 * 
 * Security Features:
 * - Input validation and sanitization
 * - Unicode normalization (é→e, ñ→n)
 * - Length limits to prevent DoS
 * - Character whitelisting
 * 
 * @example
 * detectMainCategory('Pokémon Base Set') // returns 'tcg'
 * detectMainCategory('Marvel Spider-Man') // returns 'comics'
 */

const TCG_GAMES = [
  // Pokemon variations (handles é, accents, misspellings)
  'pokemon',
  'pokémon',
  'pkmn',
  // Magic variations
  'magic',
  'magic-the-gathering',
  'magic the gathering',
  'mtg',
  'm:tg',
  // Yu-Gi-Oh variations
  'yugioh',
  'yu-gi-oh',
  'yu gi oh',
  'ygo',
  // Other TCG games
  'digimon',
  'flesh-and-blood',
  'flesh and blood',
  'fab',
  'one-piece',
  'one piece',
  'dragon-ball',
  'dragon ball',
  'dragonball',
  'cardfight-vanguard',
  'cardfight vanguard',
  'weiss-schwarz',
  'weiss schwarz',
  'final-fantasy',
  'final fantasy',
  'lorcana',
  'disney lorcana',
  'star wars',
  'starwars',
];

const COMICS_GAMES = [
  'marvel',
  'dc',
  'dc comics',
  'image',
  'dark-horse',
  'dark horse',
  'idw',
  'boom',
  'dynamite',
  'valiant',
  'comic',
  'comics',
  'batman',
  'superman',
  'spider-man',
  'spiderman',
  'x-men',
  'xmen',
];

/**
 * Normalizes input string for matching
 * - Removes special characters and accents
 * - Converts to lowercase
 * - Handles unicode normalization
 */
export function normalizeForMatching(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .trim()
    // Normalize unicode characters (é -> e, ñ -> n, etc.)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Remove special characters except spaces and hyphens
    .replace(/[^a-z0-9\s-]/g, '')
    // Normalize spaces and hyphens
    .replace(/[\s_]+/g, ' ')
    .replace(/-+/g, ' ')
    .trim();
}

/**
 * Smart matching that checks if any keyword matches the input
 * Uses normalized strings for better matching across APIs
 */
function smartMatch(input: string, keywords: string[]): boolean {
  const normalizedInput = normalizeForMatching(input);
  
  return keywords.some(keyword => {
    const normalizedKeyword = normalizeForMatching(keyword);
    
    // Exact match after normalization
    if (normalizedInput === normalizedKeyword) return true;
    
    // Check if input contains the keyword
    if (normalizedInput.includes(normalizedKeyword)) return true;
    
    // Check if keyword contains the input (for abbreviations)
    if (normalizedKeyword.length <= 5 && normalizedKeyword.includes(normalizedInput)) return true;
    
    return false;
  });
}

/**
 * Detects the main category based on game, brand, or subject
 * Handles data from PSA API, CGC API, and other sources with special characters
 */
export function detectMainCategory(input: string): 'tcg' | 'comics' {
  // Validate input
  if (!input || typeof input !== 'string') {
    console.warn('[detectMainCategory] Invalid input:', input);
    return 'tcg'; // Default to TCG
  }
  
  // Trim and limit length for safety
  const safeInput = input.trim().slice(0, 200);
  
  if (!safeInput) return 'tcg';
  
  // Check TCG games with smart matching
  if (smartMatch(safeInput, TCG_GAMES)) {
    return 'tcg';
  }
  
  // Check Comics with smart matching
  if (smartMatch(safeInput, COMICS_GAMES)) {
    return 'comics';
  }
  
  // Default to TCG
  return 'tcg';
}

/**
 * Gets a display-friendly category name
 */
export function getCategoryDisplay(category: 'tcg' | 'comics'): string {
  const map = {
    tcg: '🎴 TCG',
    comics: '📚 Comics',
  };
  return map[category] || map.tcg;
}
