import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exchangeCodeForTokens, type EbayConfig } from '../_shared/ebayAuth.ts'

// Fetch eBay user identity after OAuth
async function fetchEbayUserId(accessToken: string, environment: 'sandbox' | 'production'): Promise<string | null> {
  const baseUrl = environment === 'production' 
    ? 'https://apiz.ebay.com' 
    : 'https://apiz.sandbox.ebay.com'
  
  try {
    const response = await fetch(`${baseUrl}/commerce/identity/v1/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.warn('Failed to fetch eBay user identity:', response.status)
      return null
    }
    
    const data = await response.json()
    return data.username || null
  } catch (error) {
    console.warn('Error fetching eBay user identity:', error)
    return null
  }
}

serve(async (req) => {
  try {
    const url = new URL(req.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // ALWAYS use published domain - preview has session partitioning issues
    const appOrigin = 'https://alohacardshop.lovable.app'
    let storeKey = ''

    // Try to decode state early to get store_key
    if (state) {
      try {
        const stateData = JSON.parse(atob(state))
        storeKey = stateData.store_key || ''
      } catch {
        // State decode failed, use defaults
      }
    }

    // Handle OAuth errors - redirect with error flag
    if (error) {
      console.error('eBay OAuth error:', error, errorDescription)
      const errMsg = errorDescription || error
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(storeKey)}&error=${encodeURIComponent(errMsg)}`
      return Response.redirect(redirectUrl, 302)
    }

    if (!code || !state) {
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(storeKey)}&error=${encodeURIComponent('Missing code or state parameter')}`
      return Response.redirect(redirectUrl, 302)
    }

    // Decode state to get store_key and origin
    let stateData: { store_key: string; timestamp: number; nonce: string; origin?: string }
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=&error=${encodeURIComponent('Invalid state parameter')}`
      return Response.redirect(redirectUrl, 302)
    }

    const { store_key } = stateData
    // appOrigin is always the published domain (set above)

    // Validate timestamp (15 minute expiry)
    if (Date.now() - stateData.timestamp > 15 * 60 * 1000) {
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent('Authorization request expired. Please try again.')}`
      return Response.redirect(redirectUrl, 302)
    }

    // Get eBay credentials
    const clientId = Deno.env.get('EBAY_CLIENT_ID')
    const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')
    const ruName = Deno.env.get('EBAY_RUNAME')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!clientId || !clientSecret || !ruName) {
      console.error('Missing eBay credentials')
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent('Server configuration error: Missing eBay credentials')}`
      return Response.redirect(redirectUrl, 302)
    }

    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials')
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent('Server configuration error: Missing database credentials')}`
      return Response.redirect(redirectUrl, 302)
    }
    
    // Use the RuName as redirect_uri for token exchange (must match what was used in auth request)
    const redirectUri = ruName

    // Initialize Supabase with service role key
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get store config for environment
    const { data: storeConfig, error: storeConfigError } = await supabase
      .from('ebay_store_config')
      .select('environment')
      .eq('store_key', store_key)
      .maybeSingle()

    if (storeConfigError) {
      console.error('Failed to fetch store config:', storeConfigError)
    }

    const environment = (storeConfig?.environment || 'sandbox') as 'sandbox' | 'production'
    console.log(`Processing OAuth callback for store: ${store_key}, environment: ${environment}`)

    const config: EbayConfig = {
      clientId,
      clientSecret,
      redirectUri,
      environment,
    }

    // Exchange code for tokens - with explicit error handling
    let tokens
    try {
      console.log(`Exchanging authorization code for tokens...`)
      tokens = await exchangeCodeForTokens(config, code)
      console.log(`Token exchange successful for store: ${store_key}`)
    } catch (tokenError: any) {
      console.error('Token exchange failed:', tokenError)
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent(`Token exchange failed: ${tokenError.message}`)}`
      return Response.redirect(redirectUrl, 302)
    }

    // Calculate token expiry times
    const now = new Date()
    const accessTokenExpiry = new Date(now.getTime() + tokens.expires_in * 1000)
    const refreshTokenExpiry = new Date(now.getTime() + tokens.refresh_token_expires_in * 1000)

    // Store tokens in system_settings
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      access_token_expires_at: accessTokenExpiry.toISOString(),
      refresh_token_expires_at: refreshTokenExpiry.toISOString(),
      token_type: tokens.token_type,
    }

    // Upsert token to system_settings - CHECK FOR ERRORS
    console.log(`Saving tokens to system_settings for key: EBAY_TOKENS_${store_key}`)
    const { error: tokenSaveError } = await supabase
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

    if (tokenSaveError) {
      console.error('Failed to save tokens to system_settings:', tokenSaveError)
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent(`Failed to save tokens: ${tokenSaveError.message}`)}`
      return Response.redirect(redirectUrl, 302)
    }
    console.log(`Tokens saved successfully to system_settings`)

    // Fetch eBay user identity
    console.log(`Fetching eBay user identity...`)
    const ebayUserId = await fetchEbayUserId(tokens.access_token, environment)
    console.log(`eBay user ID: ${ebayUserId || 'unknown'}`)

    // Update store config with connection timestamp and user ID - CHECK FOR ERRORS
    console.log(`Updating ebay_store_config for store: ${store_key}`)
    const { error: configUpdateError } = await supabase
      .from('ebay_store_config')
      .upsert({
        store_key,
        environment,
        oauth_connected_at: now.toISOString(),
        is_active: true,
        ebay_user_id: ebayUserId,
        updated_at: now.toISOString(),
      }, {
        onConflict: 'store_key'
      })

    if (configUpdateError) {
      console.error('Failed to update ebay_store_config:', configUpdateError)
      const redirectUrl = `${appOrigin}/ebay?connected=0&store=${encodeURIComponent(store_key)}&error=${encodeURIComponent(`Failed to update store config: ${configUpdateError.message}`)}`
      return Response.redirect(redirectUrl, 302)
    }
    console.log(`Store config updated successfully`)

    console.log(`eBay OAuth completed successfully for store: ${store_key}`)

    // SUCCESS: Redirect back to app with success flag
    const redirectUrl = `${appOrigin}/ebay?connected=1&store=${encodeURIComponent(store_key)}`
    return Response.redirect(redirectUrl, 302)

  } catch (error: any) {
    console.error('eBay callback error:', error)
    const redirectUrl = `https://alohacardshop.lovable.app/ebay?connected=0&store=&error=${encodeURIComponent(`Connection failed: ${error.message}`)}`
    return Response.redirect(redirectUrl, 302)
  }
})