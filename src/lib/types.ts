export type GameKey = 'pokemon' | 'pokemon_japan' | 'mtg';
export type Printing = 'Normal' | 'Foil' | 'Holofoil' | 'Reverse Holofoil' | '1st Edition' | '1st Edition Holofoil' | 'unlimited' | 'unlimited Holofoil';

export const GAME_OPTIONS = [
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'pokemon_japan', label: 'Pokémon Japan' },
  { value: 'mtg', label: 'Magic: The Gathering' },
] as const;

export interface JObjectCard {
  cardId: string;
  tcgplayerId: string;
  name: string;
  set?: string;
  number?: string | number;
  images?: {
    small?: string;
    large?: string;
  };
  variants?: Array<{
    condition: string;
    printing: Printing;
    price?: number;
  }>;
}