import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CGC API Configuration from Supabase secrets
const CGC_BASE_URL = Deno.env.get('CGC_BASE_URL') || 'https://dealer-api.collectiblesgroup.com';
const CGC_COMPANY = Deno.env.get('CGC_COMPANY') || 'CGC';
const CGC_USERNAME = Deno.env.get('CGC_USERNAME');
const CGC_PASSWORD = Deno.env.get('CGC_PASSWORD');

// Token cache
let tokenCache: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<void> | null = null;

console.log('CGC function starting up...', {
  timestamp: new Date().toISOString(),
  hasUsername: !!CGC_USERNAME,
  hasPassword: !!CGC_PASSWORD,
  baseUrl: CGC_BASE_URL
});

async function fetchWithTimeout(resource: string, options: RequestInit = {}, timeoutMs = 20000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(resource, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function validateConfig() {
  if (!CGC_USERNAME || !CGC_PASSWORD) {
    console.error('Missing CGC configuration:', {
      hasUsername: !!CGC_USERNAME,
      hasPassword: !!CGC_PASSWORD
    });
    throw new Error('Missing required CGC configuration: CGC_USERNAME and CGC_PASSWORD must be set');
  }
}

async function login(): Promise<void> {
  console.log('Fetching new CGC token');
  
  const authUrl = `${CGC_BASE_URL}/auth/login/${CGC_COMPANY}`;
  
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
      error: errorText.substring(0, 200)
    });
    throw new Error(`CGC login failed: ${response.status}`);
  }

  // Normalize token - safely strip quotes
  const raw = await response.text();
  let token: string;
  try { 
    token = JSON.parse(raw); 
  } catch { 
    token = raw; 
  }
  token = token.trim().replace(/^"(.+)"$/, "$1");
  
  if (token.startsWith('"') || token.endsWith('"')) {
    throw new Error("bad_token_format");
  }

  // Safe logging - no token content
  console.log("CGC token obtained", { 
    length: token.length, 
    firstChar: token[0],
    lastChar: token[token.length - 1]
  });
  
  // Parse JWT expiry
  let expMs: number;
  try {
    const [, payload] = token.split('.');
    const p = JSON.parse(atob(payload));
    expMs = p.exp ? p.exp * 1000 : Date.now() + 29 * 24 * 3600 * 1000;
  } catch {
    expMs = Date.now() + 29 * 24 * 3600 * 1000;
  }

  tokenCache = { token, expiresAt: expMs };
  console.log('CGC token cached successfully', { 
    expiresAt: new Date(expMs).toISOString()
  });
}

async function withAuthFetch(url: string): Promise<Response> {
  // Refresh token if needed
  if (!tokenCache || Date.now() > tokenCache.expiresAt - 60000) {
    await (refreshing ||= login());
    refreshing = null;
  }

  const token = tokenCache!.token;
  
  // Assert token format
  if (token.startsWith('"')) {
    console.error("Quoted token detected");
    throw new Error("Invalid token format");
  }

  console.log('Making CGC API request:', url.replace(CGC_BASE_URL, '[BASE_URL]'));
  
  let response = await fetchWithTimeout(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  }, 20000);

  // Handle auth errors with single retry
  if (response.status === 401 || response.status === 403) {
    console.log('Auth failed, refreshing token and retrying...', { 
      status: response.status 
    });
    
    await (refreshing ||= login());
    refreshing = null;
    
    response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${tokenCache!.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, 20000);
    
    if (response.status === 401 || response.status === 403) {
      const errorBody = await response.text().catch(() => '');
      console.error('CGC auth still failing after refresh:', {
        status: response.status,
        error: errorBody.substring(0, 200)
      });
    }
  }

  return response;
}

serve(async (req) => {
  console.log('🚀 CGC function start:', {
    method: req.method,
    url: req.url.replace(/\/functions\/v1\/cgc-lookup/, '[BASE]'),
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    validateConfig();

    const url = new URL(req.url);
    const pathname = url.pathname;
    
    // Guardrail: Only allow /ccg/cards/ routes
    const routePattern = pathname.replace(/^.*\/cgc-lookup/, '');
    console.log('🛣️ Route matched:', routePattern);
    
    if (!routePattern.startsWith('/ccg/cards/')) {
      console.log('❌ Invalid route - cards only');
      return new Response(JSON.stringify({
        ok: false,
        error: 'Cards only'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let certNumber: string | null = null;
    let barcode: string | null = null;
    let include = url.searchParams.get('include') || 'pop,images'; // Default include

    // Handle GET routes: /ccg/cards/cert/:cert or /ccg/cards/barcode/:barcode
    if (req.method === 'GET') {
      if (routePattern.includes('/ccg/cards/cert/')) {
        certNumber = routePattern.split('/ccg/cards/cert/')[1];
      } else if (routePattern.includes('/ccg/cards/barcode/')) {
        barcode = routePattern.split('/ccg/cards/barcode/')[1];
      }
    }
    // Handle POST with JSON body (current client format)
    else if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      certNumber = body.certNumber;
      barcode = body.barcode;
      include = body.include || include;
    }

    console.log('📋 Request params:', { 
      certNumber: certNumber ? `${certNumber.slice(0, 4)}...` : null, 
      barcode: barcode ? `${barcode.slice(0, 4)}...` : null,
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

    // Build CGC API URL - cards endpoints only
    let apiUrl: string;
    if (certNumber) {
      apiUrl = `${CGC_BASE_URL}/cards/certifications/v3/lookup/${encodeURIComponent(certNumber)}?include=${encodeURIComponent(include)}`;
    } else {
      apiUrl = `${CGC_BASE_URL}/cards/certifications/v3/barcode/${encodeURIComponent(barcode)}?include=${encodeURIComponent(include)}`;
    }

    console.log('🔐 Auth attempt for CGC API...');
    const response = await withAuthFetch(apiUrl);
    console.log('📡 CGC API response:', { 
      status: response.status, 
      statusText: response.statusText,
      ok: response.ok 
    });

    // Pass through 404 as "Not found"
    if (response.status === 404) {
      return new Response(JSON.stringify({
        ok: false,
        error: 'Not found'
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return exact status for other errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ CGC API error:', {
        status: response.status,
        error: errorText.substring(0, 200)
      });
      
      // Special handling for 403 errors
      if (response.status === 403) {
        console.log('CGC 403 (company/scope) after refresh');
        return new Response(JSON.stringify({
          ok: false,
          error: 'CGC auth failed—verify username/password and company=CGC'
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      return new Response(JSON.stringify({
        ok: false,
        error: errorText.substring(0, 200) || `CGC API error: ${response.status}`
      }), {
        status: response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Success - return the CGC data
    const data = await response.json();
    console.log('✅ CGC API success:', { 
      certNumber: data?.certNumber ? `${data.certNumber.slice(0, 4)}...` : 'none',
      hasGrade: !!data?.grade?.displayGrade,
      hasImage: !!data?.images?.frontUrl
    });
    
    return new Response(JSON.stringify({
      ok: true,
      data: data
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