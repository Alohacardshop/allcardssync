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

// Token cache
let tokenCache: { token: string; expiresAt: number } | null = null;
let refreshing: Promise<void> | null = null;

console.log('CGC function starting up...', {
  timestamp: new Date().toISOString(),
  hasUsername: !!CGC_USERNAME,
  hasPassword: !!CGC_PASSWORD
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
  token = token.trim().replace(/^"(.+)"$/, "$1");  // final dequote guard
  
  if (token.startsWith('"') || token.endsWith('"')) {
    throw new Error("bad_token_format");
  }

  // Debug logging (safe - no token content)
  console.log("Using CGC token", { len: token.length, first: token[0] });
  
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
    expiresAt: new Date(expMs).toISOString(),
    tokenLength: token.length 
  });
}

async function withAuthFetch(url: string): Promise<Response> {
  // Ensure we have a valid token
  if (!tokenCache || Date.now() > tokenCache.expiresAt - 60000) {
    await (refreshing ||= login());
    refreshing = null;
  }

  const token = tokenCache!.token;
  
  // Assert token is properly formatted
  if (token.startsWith('"')) {
    console.error("Quoted token detected");
    throw new Error("Invalid token format detected");
  }

  console.log('Making CGC API request:', url.replace(CGC_API_BASE, '[API_BASE]'));
  
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
      status: response.status,
      statusText: response.statusText 
    });
    
    await (refreshing ||= login());
    refreshing = null;
    
    const retryToken = tokenCache!.token;
    if (retryToken.startsWith('"')) {
      console.error("Quoted token detected on retry");
      throw new Error("Invalid token format detected on retry");
    }
    
    response = await fetchWithTimeout(url, {
      headers: {
        'Authorization': `Bearer ${retryToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    }, 20000);
    
    if (response.status === 401 || response.status === 403) {
      const errorBody = await response.text().catch(() => '');
      const errorMsg = response.status === 401 
        ? "CGC auth failed/expired" 
        : "Forbidden or wrong company scope";
      
      console.error('CGC auth still failing after token refresh:', {
        status: response.status,
        error: errorBody.substring(0, 200)
      });
      
      throw new Error(`${errorMsg}: ${errorBody.substring(0, 200)}`);
    }
  }

  return response;
}

serve(async (req) => {
  console.log('CGC function invoked:', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('Returning CORS preflight response');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate configuration
    validateConfig();

    // Only support POST requests
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

    // Build API URL
    let apiUrl: string;
    if (certNumber) {
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/lookup/${encodeURIComponent(certNumber)}?include=${encodeURIComponent(include)}`;
    } else {
      apiUrl = `${CGC_API_BASE}/cards/certifications/v3/barcode/${encodeURIComponent(barcode)}?include=${encodeURIComponent(include)}`;
    }

    console.log('CGC lookup starting:', { endpoint: 'cards/certifications/v3' });

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
      console.error('CGC API error:', {
        status: response.status,
        error: errorText.substring(0, 200)
      });
      
      return new Response(JSON.stringify({
        ok: false,
        error: `CGC API error: ${response.status} - ${errorText.substring(0, 200)}`
      }), {
        status: response.status >= 500 ? 502 : response.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    
    // Return raw data for now - we can normalize later
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