/**
 * Utility to auto-detect main category based on game/brand/subject
 */

const TCG_GAMES = [
  'pokemon',
  'magic',
  'magic-the-gathering',
  'mtg',
  'yugioh',
  'yu-gi-oh',
  'digimon',
  'flesh-and-blood',
  'fab',
  'one-piece',
  'dragon-ball',
  'cardfight-vanguard',
  'weiss-schwarz',
  'final-fantasy',
];

const SPORTS_GAMES = [
  'baseball',
  'basketball',
  'football',
  'hockey',
  'soccer',
  'golf',
  'tennis',
  'boxing',
  'mma',
  'ufc',
  'nascar',
  'wrestling',
  'wwe',
];

const COMICS_GAMES = [
  'marvel',
  'dc',
  'image',
  'dark-horse',
  'idw',
  'boom',
  'dynamite',
  'valiant',
  'comic',
  'comics',
];

/**
 * Detects the main category based on game, brand, or subject
 */
export function detectMainCategory(input: string): 'tcg' | 'sports' | 'comics' {
  if (!input) return 'tcg'; // Default to TCG
  
  const normalized = input.toLowerCase().trim().replace(/\s+/g, '-');
  
  // Check TCG games
  if (TCG_GAMES.some(game => normalized.includes(game))) {
    return 'tcg';
  }
  
  // Check Sports
  if (SPORTS_GAMES.some(game => normalized.includes(game))) {
    return 'sports';
  }
  
  // Check Comics
  if (COMICS_GAMES.some(game => normalized.includes(game))) {
    return 'comics';
  }
  
  // Default to TCG
  return 'tcg';
}

/**
 * Gets a display-friendly category name
 */
export function getCategoryDisplay(category: 'tcg' | 'sports' | 'comics'): string {
  const map = {
    tcg: '🎴 TCG',
    sports: '⚾ Sports',
    comics: '📚 Comics',
  };
  return map[category] || map.tcg;
}
