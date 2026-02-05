/**
 * Location nickname mappings for display
 * Maps full Shopify location names to short, recognizable nicknames
 */

export const LOCATION_NICKNAMES: Record<string, string> = {
  'Aloha Card Shop Windward Mall': 'Windward',
  'Aloha Card Shop Kahala': 'Kahala',
  'Aloha Card Shop Ward Warehouse': 'Ward Warehouse',
};

/**
 * Get nickname from full location name
 * Returns the nickname if found, otherwise returns the full name unchanged
 */
export function getLocationNickname(fullName: string): string {
  if (!fullName) return '';
  return LOCATION_NICKNAMES[fullName] || fullName;
}

/**
 * Get both nickname and full name for display with tooltip
 */
export function getLocationDisplayInfo(fullName: string): { nickname: string; fullName: string } {
  if (!fullName) return { nickname: '', fullName: '' };
  const nickname = LOCATION_NICKNAMES[fullName] || fullName;
  return { nickname, fullName };
}
