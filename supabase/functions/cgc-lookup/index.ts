import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CGC API Configuration
const CGC_API_BASE = 'https://dealer-api.collectiblesgroup.com';
const CGC_COMPANY = 'CGC';
const CGC_USERNAME = Deno.env.get('CGC_USERNAME');
const CGC_PASSWORD = Deno.env.get('CGC_PASSWORD');

// Token cache with promise lock to prevent concurrent refreshes
let tokenCache: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<void> | null = null;

// Upstream fetch with timeout helper
async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

type NormalizedCard = {
  gradingCompany: "CGC";
  certNumber: string;
  barcode?: string | null;
  grade: {
    display: string | null;
    autographGrade?: string | null;
    autographType?: string | null;
    numeric?: number | null;
  };
  collectible: {
    cardName?: string | null;
    cardNumber?: string | null;
    cardYear?: string | null;
    game?: string | null;
    seriesName?: string | null;
    setName?: string | null;
    subsetName?: string | null;
    makerName?: string | null;
    language?: string | null;
    rarity?: string | null;
    variant1?: string | null;
    variant2?: string | null;
    isParallel?: boolean | null;
  };
  metadata: {
    encapsulationDate?: string | null;
    gradedDate?: string | null;
    submissionNumber?: string | null;
    barcode?: string | null;
  };
  additionalInfo?: {
    pedigree?: string | null;
    errorType?: string | null;
    graderNotes?: unknown[];
    signatures?: unknown[];
  };
  images?: {
    frontUrl?: string | null;
    frontThumbnailUrl?: string | null;
    rearUrl?: string | null;
    rearThumbnailUrl?: string | null;
  };
  population?: Record<string, number> | null;
  raw: unknown;
};

function validateConfig() {
  console.log('Validating CGC configuration:', {
    hasCGC_USERNAME: !!CGC_USERNAME,
    hasCGC_PASSWORD: !!CGC_PASSWORD,
    timestamp: new Date().toISOString()
  });
  
  if (!CGC_USERNAME || !CGC_PASSWORD) {
    console.error('Missing CGC configuration:', {
      CGC_USERNAME: !!CGC_USERNAME,
      CGC_PASSWORD: !!CGC_PASSWORD
    });
    throw new Error('Missing required CGC configuration: CGC_USERNAME and CGC_PASSWORD must be set');
  }
}

async function login(): Promise<void> {
  console.log('Fetching new CGC token');
  
  const authUrl = `${CGC_API_BASE}/auth/login/${CGC_COMPANY}`;
  
  const response = await fetchWithTimeout(authUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Username: CGC_USERNAME,
      Password: CGC_PASSWORD,
    }),
  }, 15000);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('CGC auth failed:', {
      status: response.status,
      statusText: response.statusText,
      error: errorText
    });
    throw new Error(`CGC login failed: ${response.status}`);
  }

  const token = await response.text();
  
  // Parse JWT expiry or fallback to 29 days
  let expMs: number;
  try {
    const [, payload] = token.trim().split('.');
    const { exp } = JSON.parse(atob(payload));
    expMs = exp ? exp * 1000 : Date.now() + 29 * 24 * 3600 * 1000;
  } catch {
    expMs = Date.now() + 29 * 24 * 3600 * 1000;
  }

  tokenCache = { token: token.trim(), expiresAt: expMs };
  console.log('CGC token cached successfully', { expiresAt: new Date(expMs).toISOString() });
}

async function withAuthFetch(url: string): Promise<Response> {
  // Ensure we have a valid token (refresh if needed)
  if (!tokenCache || Date.now() > tokenCache.expiresAt - 60000) {
    await (refreshing ||= login());
    refreshing = null;
  }

  console.log('Making CGC API request to cards endpoint:', url.replace(CGC_API_BASE, '[API_BASE]'));
  
  let response = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${tokenCache!.token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }, 20000);

  // Handle auth errors with single retry
  if (response.status === 401 || response.status === 403) {
    console.log('Auth failed, refreshing token and retrying...');
    await (refreshing ||= login());
    refreshing = null;
    
    response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${tokenCache!.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, 20000);
  }

  return response;
}

function parseGradeNumeric(display: string | null): number | null {
  if (!display) return null;
  
  // Try to extract numeric grade from display string
  const numericMatch = display.match(/(\d+(?:\.\d+)?)/);
  if (numericMatch) {
    return parseFloat(numericMatch[1]);
  }
  
  // Handle special cases like "Gem Mint 10"
  if (display.toLowerCase().includes('gem mint')) {
    const gemMatch = display.match(/gem mint\s*(\d+)/i);
    if (gemMatch) return parseInt(gemMatch[1]);
    return 10; // Default gem mint to 10
  }
  
  return null;
}

function normalizeCgcCard(data: any, includeOptions?: string): NormalizedCard {
  const includeFlags = includeOptions ? includeOptions.split(',').map(s => s.trim()) : [];
  
  // Map CGC API response to our normalized format
  const normalized: NormalizedCard = {
    gradingCompany: "CGC",
    certNumber: data?.certificationNumber?.toString() || data?.certNumber?.toString() || '',
    barcode: data?.barcode || null,
    grade: {
      display: data?.grade?.toString() || data?.gradeDisplay || null,
      autographGrade: data?.autographGrade || null,
      autographType: data?.autographType || null,
      numeric: null,
    },
    collectible: {
      cardName: data?.cardName || data?.subject || null,
      cardNumber: data?.cardNumber || data?.number || null,
      cardYear: data?.year?.toString() || data?.cardYear?.toString() || null,
      game: data?.game || data?.category || null,
      seriesName: data?.series || data?.seriesName || null,
      setName: data?.set || data?.setName || null,
      subsetName: data?.subset || data?.subsetName || null,
      makerName: data?.maker || data?.brand || data?.manufacturer || null,
      language: data?.language || null,
      rarity: data?.rarity || null,
      variant1: data?.variant || data?.variant1 || null,
      variant2: data?.variant2 || null,
      isParallel: data?.isParallel || null,
    },
    metadata: {
      encapsulationDate: data?.encapsulationDate || data?.dateEncapsulated || null,
      gradedDate: data?.gradedDate || data?.dateGraded || null,
      submissionNumber: data?.submissionNumber?.toString() || null,
      barcode: data?.barcode || null,
    },
    additionalInfo: {
      pedigree: data?.pedigree || null,
      errorType: data?.errorType || null,
      graderNotes: data?.graderNotes || data?.notes || [],
      signatures: data?.signatures || [],
    },
    raw: data,
  };

  // Parse numeric grade from display
  normalized.grade.numeric = parseGradeNumeric(normalized.grade.display);

  // Add images if requested
  if (includeFlags.includes('images') && data?.images) {
    normalized.images = {
      frontUrl: data.images.front || data.images.frontUrl || null,
      frontThumbnailUrl: data.images.frontThumbnail || data.images.frontThumbnailUrl || null,
      rearUrl: data.images.rear || data.images.rearUrl || null,
      rearThumbnailUrl: data.images.rearThumbnail || data.images.rearThumbnailUrl || null,
    };
  }

  // Add population if requested
  if (includeFlags.includes('pop') && data?.population) {
    normalized.population = data.population;
  }

  return normalized;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate configuration
    validateConfig();

    // Only support POST requests with JSON body for cards-only endpoints
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Only POST method supported'
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { certNumber, barcode, include = 'pop,images' } = body;

    // Validate input
    if (!certNumber && !barcode) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Missing certNumber or barcode'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build cards-only API URL (enforcing cards restriction)
    let apiUrl: string;
    
    if (certNumber) {
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/lookup/${encodeURIComponent(certNumber)}?include=${encodeURIComponent(include)}`;
    } else {
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/barcode/${encodeURIComponent(barcode)}?include=${encodeURIComponent(include)}`;
    }

    console.log('CGC cards lookup:', { hasAuth: !!tokenCache, endpoint: 'cards/certifications/v3' });

    const response = await withAuthFetch(apiUrl);

    if (response.status === 404) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Certificate not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('CGC API error:', response.status, errorText);
      
      return new Response(JSON.stringify({
        ok: false,
        error: `CGC API error: ${response.status}`
      }), {
        status: response.status >= 500 ? 502 : response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const normalized = normalizeCgcCard(data, include);

    return new Response(JSON.stringify({
      ok: true,
      data: normalized
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    
    if (error instanceof Error && error.name === 'AbortError') {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Request timed out'
      }), {
        status: 504,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.error('CGC function error:', message);
    
    return new Response(JSON.stringify({
      ok: false,
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});