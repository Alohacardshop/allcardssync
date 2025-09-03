import { createClient } from "@supabase/supabase-js";

// TCG Database Connection
const TCG_URL = "https://dhyvufggodqkcjbrjhxk.supabase.co";
const TCG_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoeXZ1Zmdnb2Rxa2NqYnJqaHhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1MDIyOTcsImV4cCI6MjA3MjA3ODI5N30.0GncadcSHVbthqyubXLiBflm44sFEz_izfF5uF-xEvs";

export const tcgSupabase = createClient(TCG_URL, TCG_ANON_KEY, {
  auth: {
    persistSession: false
  }
});

// TCG Database Types
export interface Game {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  description?: string;
}

export interface Set {
  id: string;
  name: string;
  code: string;
  game_id: string;
  release_date?: string;
  card_count?: number;
}

export interface Card {
  id: string;
  name: string;
  set_id: string;
  justtcg_card_id: string;
  rarity?: string;
  image_url?: string;
  type_line?: string;
  mana_cost?: string;
  oracle_text?: string;
}

export interface Variant {
  id: string;
  card_id: string;
  condition: string;
  printing: string;
  price_cents: number;
  market_price_cents?: number;
}

export interface SearchResult {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  number?: string;
  rarity?: string;
  image_url?: string;
  rank: number;
}

export interface PopularCard {
  id: string;
  name: string;
  set_name: string;
  game_name: string;
  image_url?: string;
  avg_price_cents: number;
  variant_count: number;
  rarity?: string; // Added optional rarity field
}

export interface PricingData {
  cardId: string;
  variants: {
    condition: string;
    printing: string;
    price_cents: number;
    market_price_cents?: number;
    last_updated: string;
  }[];
}