import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCodeForTokens, type EbayConfig } from '../_shared/ebayAuth.ts'

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Handle OAuth errors
    if (error) {
      console.error('eBay OAuth error:', error, errorDescription)
      return new Response(
        generateHtmlResponse(false, `eBay authorization failed: ${errorDescription || error}`),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    if (!code || !state) {
      return new Response(
        generateHtmlResponse(false, 'Missing code or state parameter'),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Decode state to get store_key
    let stateData: { store_key: string; timestamp: number; nonce: string }
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      return new Response(
        generateHtmlResponse(false, 'Invalid state parameter'),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    const { store_key } = stateData

    // Validate timestamp (15 minute expiry)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      return new Response(
        generateHtmlResponse(false, 'Authorization request expired. Please try again.'),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    // Get eBay credentials
    const clientId = Deno.env.get('EBAY_CLIENT_ID')!
    const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Derive redirect URI from Supabase URL automatically
    const redirectUri = `${supabaseUrl}/functions/v1/ebay-auth-callback`

    // Initialize Supabase
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get store config for environment
    const { data: storeConfig } = await supabase
      .from('ebay_store_config')
      .select('environment')
      .eq('store_key', store_key)
      .maybeSingle()

    const environment = (storeConfig?.environment || 'sandbox') as 'sandbox' | 'production'

    const config: EbayConfig = {
      clientId,
      clientSecret,
      redirectUri,
      environment,
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(config, code)

    // Calculate token expiry times
    const now = new Date()
    const accessTokenExpiry = new Date(now.getTime() + tokens.expires_in * 1000)
    const refreshTokenExpiry = new Date(now.getTime() + tokens.refresh_token_expires_in * 1000)

    // Store tokens encrypted in system_settings
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessTokenExpiry.toISOString(),
      refresh_token_expires_at: refreshTokenExpiry.toISOString(),
      token_type: tokens.token_type,
    }

    // Upsert token to system_settings (encrypted)
    await supabase
      .from('system_settings')
      .upsert({
        key_name: `EBAY_TOKENS_${store_key}`,
        key_value: JSON.stringify(tokenData),
        is_encrypted: true,
        category: 'ebay',
        description: `eBay OAuth tokens for store: ${store_key}`,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'key_name'
      })

    // Update store config with connection timestamp
    await supabase
      .from('ebay_store_config')
      .upsert({
        store_key,
        environment,
        oauth_connected_at: now.toISOString(),
        is_active: true,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'store_key'
      })

    console.log(`eBay OAuth successful for store: ${store_key}`)

    return new Response(
      generateHtmlResponse(true, `Successfully connected eBay account for ${store_key}!`),
      { headers: { 'Content-Type': 'text/html' } }
    )

  } catch (error) {
    console.error('eBay callback error:', error)
    return new Response(
      generateHtmlResponse(false, `Connection failed: ${error.message}`),
      { headers: { 'Content-Type': 'text/html' } }
    )
  }
})

function generateHtmlResponse(success: boolean, message: string): string {
  const bgColor = success ? '#10b981' : '#ef4444'
  const icon = success ? '✓' : '✗'
  
  return `
<!DOCTYPE html>
<html>
<head>
  <title>eBay Connection ${success ? 'Successful' : 'Failed'}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
      background: rgba(255,255,255,0.1);
      border-radius: 1rem;
      backdrop-filter: blur(10px);
      max-width: 400px;
    }
    .icon {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 1.5rem;
    }
    h1 { margin: 0 0 1rem; font-size: 1.5rem; }
    p { margin: 0 0 1.5rem; opacity: 0.9; }
    .close-btn {
      background: white;
      color: #1a1a2e;
      border: none;
      padding: 0.75rem 2rem;
      border-radius: 0.5rem;
      font-size: 1rem;
      cursor: pointer;
      font-weight: 500;
    }
    .close-btn:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">${icon}</div>
    <h1>${success ? 'Connection Successful!' : 'Connection Failed'}</h1>
    <p>${message}</p>
    <button class="close-btn" onclick="window.close(); window.opener?.location.reload();">
      Close Window
    </button>
  </div>
  <script>
    // Auto-close after 5 seconds if successful
    ${success ? 'setTimeout(() => { window.close(); window.opener?.location.reload(); }, 5000);' : ''}
  </script>
</body>
</html>
`
}
