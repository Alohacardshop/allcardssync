export interface PSACertificateData {
  certNumber: string;
  isValid: boolean;
  grade?: string;
  year?: string;
  brandTitle?: string;
  subject?: string;
  cardNumber?: string;
  varietyPedigree?: string;
  category?: string;
  imageUrl?: string;
  imageUrls?: string[];
  psaUrl: string;
  source?: string;
  diagnostics?: {
    totalMs: number;
    cached?: boolean;
    cacheAge?: number;
    hadApiKey: boolean;
    firecrawlStatus?: number;
    settingsMs?: number;
    firecrawlMs?: number;
    proxyMode?: string;
    formats?: string[];
    usedCache?: boolean;
    dbSaved?: boolean;
  };
}

export interface PSACertificateResponse {
  ok: boolean;
  error?: string;
  data?: PSACertificateData;
  message?: string;
}

export interface PSADatabaseRecord {
  id: string;
  cert_number: string;
  is_valid: boolean;
  grade?: string;
  year?: string;
  brand?: string;
  subject?: string;
  card_number?: string;
  variety_pedigree?: string;
  category?: string;
  psa_url: string;
  image_url?: string;
  image_urls?: string[];
  scraped_at: string;
  updated_at: string;
  created_at: string;
  raw_html?: string;
  raw_markdown?: string;
  firecrawl_response?: any;
}

export type PSAGrade = '1' | '1.5' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'POOR' | 'FAIR' | 'GOOD' | 'VG' | 'EX' | 'NM' | 'MINT';

export const PSA_GRADE_COLORS: Record<string, string> = {
  '10': 'hsl(var(--chart-1))', // Gold
  '9': 'hsl(var(--chart-2))', // Silver  
  '8': 'hsl(var(--chart-3))', // Bronze
  '7': 'hsl(var(--chart-4))', // Good
  '6': 'hsl(var(--chart-5))', // Average
  'MINT': 'hsl(var(--chart-1))',
  'NM': 'hsl(var(--chart-2))',
  'EX': 'hsl(var(--chart-3))',
  'VG': 'hsl(var(--chart-4))',
  'GOOD': 'hsl(var(--chart-5))',
};