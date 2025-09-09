import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CGC API configuration
const CGC_API_BASE = Deno.env.get('CGC_API_BASE') || 'https://dealer-api.collectiblesgroup.com';
const CGC_USERNAME = Deno.env.get('CGC_USERNAME');
const CGC_PASSWORD = Deno.env.get('CGC_PASSWORD');

// Token cache - simple in-memory cache with expiry
let tokenCache: { token: string; expiresAt: number } | null = null;

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
  if (!CGC_USERNAME || !CGC_PASSWORD || !CGC_API_BASE) {
    throw new Error('Missing required CGC configuration: CGC_USERNAME, CGC_PASSWORD, and CGC_API_BASE must be set');
  }
}

async function fetchCGCToken(): Promise<string> {
  // Check cache first
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    console.log('Using cached CGC token');
    return tokenCache.token;
  }

  console.log('Fetching new CGC token');
  
  const response = await fetch(`${CGC_API_BASE}/auth/login/CGC`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      Username: CGC_USERNAME,
      Password: CGC_PASSWORD,
    }),
  });

  if (!response.ok) {
    throw new Error(`CGC auth failed: ${response.status} ${response.statusText}`);
  }

  const token = await response.text(); // JWT returned as plain string
  
  // Cache token for 30 days (minus 1 hour for safety)
  const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000) - (60 * 60 * 1000);
  tokenCache = { token, expiresAt };

  return token;
}

async function makeAuthorizedRequest(url: string, retryOnAuth = true): Promise<Response> {
  const token = await fetchCGCToken();
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  // If 401 and retry allowed, clear cache and try once more
  if (response.status === 401 && retryOnAuth) {
    console.log('CGC token expired, retrying with fresh token');
    tokenCache = null; // Clear cache
    return makeAuthorizedRequest(url, false); // Retry once without further retries
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
  console.log('Normalizing CGC card data', { 
    hasData: !!data, 
    keys: data ? Object.keys(data) : [],
    includeOptions 
  });

  const includeFlags = includeOptions ? includeOptions.split(',').map(s => s.trim()) : [];
  
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

  // Parse numeric grade
  normalized.grade.numeric = parseGradeNumeric(normalized.grade.display);

  // Add images if included
  if (includeFlags.includes('images') && data?.images) {
    normalized.images = {
      frontUrl: data.images.front || data.images.frontUrl || null,
      frontThumbnailUrl: data.images.frontThumbnail || data.images.frontThumbnailUrl || null,
      rearUrl: data.images.rear || data.images.rearUrl || null,
      rearThumbnailUrl: data.images.rearThumbnail || data.images.rearThumbnailUrl || null,
    };
  }

  // Add population if included
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

    const url = new URL(req.url);
    const certNumber = url.searchParams.get('certNumber');
    const barcode = url.searchParams.get('barcode');
    const include = url.searchParams.get('include') || '';

    console.log('CGC lookup request', { 
      certNumber: certNumber ? `${certNumber.substring(0, 4)}...` : null,
      barcode: barcode ? `${barcode.substring(0, 4)}...` : null,
      include 
    });

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

    let apiUrl: string;
    let fallbackUrl: string | null = null;

    if (certNumber) {
      // Primary: v3 certification lookup
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/lookup/${certNumber}`;
      if (include) {
        apiUrl += `?include=${encodeURIComponent(include)}`;
      }
      
      // Fallback: v2 certification lookup
      fallbackUrl = `${CGC_API_BASE}/cards/certifications/v2/lookup/${certNumber}`;
    } else {
      // Barcode lookup - encode properly (/ becomes %2F)
      const encodedBarcode = encodeURIComponent(barcode!);
      
      // Primary: v3 barcode lookup
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/barcode/${encodedBarcode}`;
      if (include) {
        apiUrl += `?include=${encodeURIComponent(include)}`;
      }
      
      // Fallback: v2 barcode lookup
      fallbackUrl = `${CGC_API_BASE}/cards/certifications/v2/barcode/${encodedBarcode}`;
    }

    console.log('Trying CGC API URL:', apiUrl.replace(CGC_API_BASE, '[CGC_API_BASE]'));

    // Try primary endpoint (v3)
    let response = await makeAuthorizedRequest(apiUrl);
    let tryFallback = false;

    if (response.status === 404) {
      tryFallback = true;
    } else if (response.status === 401) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } else if (response.status === 403) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Forbidden or wrong company scope'
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try fallback (v2) if primary failed with 404
    if (tryFallback && fallbackUrl) {
      console.log('Trying v2 fallback:', fallbackUrl.replace(CGC_API_BASE, '[CGC_API_BASE]'));
      response = await makeAuthorizedRequest(fallbackUrl);
    }

    if (!response.ok) {
      if (response.status === 404) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Not found'
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`CGC API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log('CGC API success', { 
      hasData: !!data, 
      keys: data ? Object.keys(data) : [] 
    });

    const normalized = normalizeCgcCard(data, include);

    return new Response(JSON.stringify({
      ok: true,
      data: normalized
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('CGC lookup error:', error);
    
    return new Response(JSON.stringify({
      ok: false,
      error: 'Unexpected error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});