import { createClient } from '@supabase/supabase-js';

// External TCG database (read-only)
const EXTERNAL_URL = 'https://ljywcyhnpzqgpowwrpre.supabase.co';
const EXTERNAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqeXdjeWhucHpxZ3Bvd3dycHJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTcwOTI2ODIsImV4cCI6MjA3MjY2ODY4Mn0.Hq0zKaJaWhNR4WLnqM4-UelgRFEPEFi_sk6p7CzqSEA';

export const tcgLjyClient = createClient(EXTERNAL_URL, EXTERNAL_ANON_KEY, {
  auth: {
    persistSession: false, // Read-only client, no session needed
    storage: undefined, // Disable storage to avoid conflicts
    autoRefreshToken: false,
    detectSessionInUrl: false,
  }
});

// Type definitions for external database
export interface ExternalGame {
  id: string;
  name: string;
  slug?: string;
}

export interface ExternalSet {
  id: string;
  name: string;
  game_id?: string;
  release_date?: string;
}

export interface ExternalCard {
  id: string;
  name: string;
  number?: string;
  rarity?: string;
  image_url?: string;
  game_id?: string;
  set_id?: string;
  // Joined data
  set_name?: string;
  game_name?: string;
}

export interface ExternalPrice {
  id: string;
  card_id: string;
  price_cents?: number;
  market_price_cents?: number;
  low_price_cents?: number;
  high_price_cents?: number;
  created_at: string;
}

export interface SearchFilters {
  gameId?: string;
  setId?: string;
  rarity?: string;
  page?: number;
  pageSize?: number;
}