/**
 * eBay API client utilities
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EBAY_SANDBOX_API = 'https://api.sandbox.ebay.com'
const EBAY_PRODUCTION_API = 'https://api.ebay.com'

export interface EbayTokens {
  access_token: string
  refresh_token: string
  access_token_expires_at: string
  refresh_token_expires_at: string
}

export interface EbayInventoryItem {
  sku: string
  product: {
    title: string
    description: string
    aspects?: Record<string, string[]>
    imageUrls?: string[]
  }
  condition: string
  conditionDescription?: string
  availability: {
    shipToLocationAvailability: {
      quantity: number
    }
  }
}

export interface EbayOffer {
  sku: string
  marketplaceId: string
  format: 'FIXED_PRICE'
  listingDescription?: string
  availableQuantity: number
  pricingSummary: {
    price: {
      value: string
      currency: string
    }
  }
  listingPolicies: {
    fulfillmentPolicyId: string
    paymentPolicyId: string
    returnPolicyId: string
  }
  categoryId: string
  merchantLocationKey?: string
}

/**
 * Get valid access token for store, refreshing if needed
 */
export async function getValidAccessToken(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  environment: 'sandbox' | 'production'
): Promise<string> {
  // Get stored tokens
  const { data: tokenData } = await supabase
    .from('system_settings')
    .select('key_value')
    .eq('key_name', `EBAY_TOKENS_${storeKey}`)
    .single()

  if (!tokenData?.key_value) {
    throw new Error(`eBay not connected for store: ${storeKey}. Please complete OAuth flow.`)
  }

  const tokens: EbayTokens = JSON.parse(tokenData.key_value)
  const now = new Date()
  const expiresAt = new Date(tokens.access_token_expires_at)

  // If token expires in less than 5 minutes, refresh it
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    return await refreshAndStoreToken(supabase, storeKey, tokens, environment)
  }

  return tokens.access_token
}

/**
 * Refresh access token and store new tokens
 */
async function refreshAndStoreToken(
  supabase: ReturnType<typeof createClient>,
  storeKey: string,
  tokens: EbayTokens,
  environment: 'sandbox' | 'production'
): Promise<string> {
  const clientId = Deno.env.get('EBAY_CLIENT_ID')!
  const clientSecret = Deno.env.get('EBAY_CLIENT_SECRET')!
  const credentials = btoa(`${clientId}:${clientSecret}`)

  const tokenUrl = environment === 'sandbox'
    ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
    : 'https://api.ebay.com/identity/v1/oauth2/token'

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh eBay token: ${error}`)
  }

  const newTokens = await response.json()
  const now = new Date()

  const updatedTokens: EbayTokens = {
    access_token: newTokens.access_token,
    refresh_token: newTokens.refresh_token || tokens.refresh_token,
    access_token_expires_at: new Date(now.getTime() + newTokens.expires_in * 1000).toISOString(),
    refresh_token_expires_at: tokens.refresh_token_expires_at, // Keep original
  }

  // Store updated tokens
  await supabase
    .from('system_settings')
    .update({
      key_value: JSON.stringify(updatedTokens),
      updated_at: now.toISOString(),
    })
    .eq('key_name', `EBAY_TOKENS_${storeKey}`)

  return updatedTokens.access_token
}

/**
 * Make authenticated eBay API request
 */
export async function ebayApiRequest(
  accessToken: string,
  environment: 'sandbox' | 'production',
  method: string,
  endpoint: string,
  body?: unknown
): Promise<Response> {
  const baseUrl = environment === 'sandbox' ? EBAY_SANDBOX_API : EBAY_PRODUCTION_API
  const url = `${baseUrl}${endpoint}`

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  const options: RequestInit = {
    method,
    headers,
  }

  if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    options.body = JSON.stringify(body)
  }

  return fetch(url, options)
}

/**
 * Create or update inventory item
 */
export async function createOrUpdateInventoryItem(
  accessToken: string,
  environment: 'sandbox' | 'production',
  item: EbayInventoryItem
): Promise<{ success: boolean; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'PUT',
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`,
    item
  )

  if (response.status === 204 || response.status === 200) {
    return { success: true }
  }

  const error = await response.text()
  return { success: false, error: `Failed to create inventory item: ${response.status} - ${error}` }
}

/**
 * Create offer for inventory item
 */
export async function createOffer(
  accessToken: string,
  environment: 'sandbox' | 'production',
  offer: EbayOffer
): Promise<{ success: boolean; offerId?: string; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'POST',
    '/sell/inventory/v1/offer',
    offer
  )

  if (response.status === 201) {
    const data = await response.json()
    return { success: true, offerId: data.offerId }
  }

  const error = await response.text()
  return { success: false, error: `Failed to create offer: ${response.status} - ${error}` }
}

/**
 * Publish offer to make it live
 */
export async function publishOffer(
  accessToken: string,
  environment: 'sandbox' | 'production',
  offerId: string
): Promise<{ success: boolean; listingId?: string; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'POST',
    `/sell/inventory/v1/offer/${offerId}/publish`
  )

  if (response.status === 200) {
    const data = await response.json()
    return { success: true, listingId: data.listingId }
  }

  const error = await response.text()
  return { success: false, error: `Failed to publish offer: ${response.status} - ${error}` }
}

/**
 * Update offer
 */
export async function updateOffer(
  accessToken: string,
  environment: 'sandbox' | 'production',
  offerId: string,
  offer: Partial<EbayOffer>
): Promise<{ success: boolean; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'PUT',
    `/sell/inventory/v1/offer/${offerId}`,
    offer
  )

  if (response.status === 204 || response.status === 200) {
    return { success: true }
  }

  const error = await response.text()
  return { success: false, error: `Failed to update offer: ${response.status} - ${error}` }
}

/**
 * Delete inventory item (ends listing)
 */
export async function deleteInventoryItem(
  accessToken: string,
  environment: 'sandbox' | 'production',
  sku: string
): Promise<{ success: boolean; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'DELETE',
    `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
  )

  if (response.status === 204) {
    return { success: true }
  }

  const error = await response.text()
  return { success: false, error: `Failed to delete inventory item: ${response.status} - ${error}` }
}

/**
 * Get offer by SKU
 */
export async function getOffersBySku(
  accessToken: string,
  environment: 'sandbox' | 'production',
  sku: string
): Promise<{ offers?: any[]; error?: string }> {
  const response = await ebayApiRequest(
    accessToken,
    environment,
    'GET',
    `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`
  )

  if (response.status === 200) {
    const data = await response.json()
    return { offers: data.offers || [] }
  }

  if (response.status === 404) {
    return { offers: [] }
  }

  const error = await response.text()
  return { error: `Failed to get offers: ${response.status} - ${error}` }
}

/**
 * Map condition from internal format to eBay condition ID
 */
export function mapConditionToEbay(condition?: string): string {
  const conditionMap: Record<string, string> = {
    'new': 'NEW',
    'mint': 'NEW',
    'near_mint': 'LIKE_NEW',
    'excellent': 'VERY_GOOD',
    'good': 'GOOD',
    'fair': 'ACCEPTABLE',
    'poor': 'FOR_PARTS_OR_NOT_WORKING',
  }
  
  const normalized = (condition || 'new').toLowerCase().replace(/\s+/g, '_')
  return conditionMap[normalized] || 'NEW'
}
