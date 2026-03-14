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
 * detectMainCategory('Baseball Cards') // returns 'sports'
 */

export type MainCategory = 'tcg' | 'comics' | 'sports';

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

const SPORTS_KEYWORDS = [
  'baseball',
  'basketball',
  'football',
  'hockey',
  'soccer',
  'boxing',
  'wrestling',
  'golf',
  'tennis',
  'racing',
  'nascar',
  'ufc',
  'mma',
  'cricket',
  'rugby',
  'olympic',
  'olympics',
  'nba',
  'nfl',
  'mlb',
  'nhl',
  'mls',
  'topps',
  'bowman',
  'donruss',
  'panini',
  'upper deck',
  'fleer',
  'score',
  'stadium club',
  'prizm',
  'select',
  'mosaic',
  'optic',
  'chronicles',
  'national treasures',
  'immaculate',
  'spectra',
];

const COMICS_KEYWORDS = [
  'marvel comics',
  'dc comics',
  'image comics',
  'dark horse comics',
  'dark-horse',
  'dark horse',
  'idw publishing',
  'boom studios',
  'dynamite entertainment',
  'valiant comics',
  'comic book',
  'comic books',
  'comics',
  'batman',
  'superman',
  'spider-man',
  'spiderman',
  'x-men',
  'xmen',
  'avengers',
  'justice league',
  'graphic novel',
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
 * 
 * Priority order: TCG → Sports → Comics → default (TCG)
 */
export function detectMainCategory(input: string): MainCategory {
  // Validate input
  if (!input || typeof input !== 'string') {
    console.warn('[detectMainCategory] Invalid input:', input);
    return 'tcg'; // Default to TCG
  }
  
  // Trim and limit length for safety
  const safeInput = input.trim().slice(0, 200);
  
  if (!safeInput) return 'tcg';
  
  // Check TCG games first (highest priority)
  if (smartMatch(safeInput, TCG_GAMES)) {
    return 'tcg';
  }
  
  // Check Sports keywords second
  if (smartMatch(safeInput, SPORTS_KEYWORDS)) {
    return 'sports';
  }
  
  // Check Comics last (tightened keywords to avoid false positives)
  if (smartMatch(safeInput, COMICS_KEYWORDS)) {
    return 'comics';
  }
  
  // Default to TCG
  return 'tcg';
}

/**
 * Gets a display-friendly category name
 */
export function getCategoryDisplay(category: MainCategory): string {
  const map = {
    tcg: '🎴 TCG',
    comics: '📚 Comics',
    sports: '⚾ Sports',
  };
  return map[category] || map.tcg;
}
