/**
 * Shared eBay OAuth utilities
 */

export const EBAY_SANDBOX_AUTH_URL = 'https://auth.sandbox.ebay.com/oauth2/authorize';
export const EBAY_PRODUCTION_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
export const EBAY_SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
export const EBAY_PRODUCTION_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';

// Required scopes for inventory management
export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
].join(' ');

export interface EbayTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  refresh_token_expires_in: number;
  token_type: string;
}

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

export function getAuthUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'sandbox' ? EBAY_SANDBOX_AUTH_URL : EBAY_PRODUCTION_AUTH_URL;
}

export function getTokenUrl(environment: 'sandbox' | 'production'): string {
  return environment === 'sandbox' ? EBAY_SANDBOX_TOKEN_URL : EBAY_PRODUCTION_TOKEN_URL;
}

export function buildAuthorizationUrl(config: EbayConfig, state: string): string {
  const authUrl = getAuthUrl(config.environment);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: EBAY_SCOPES,
    state: state,
  });
  
  return `${authUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  config: EbayConfig,
  code: string
): Promise<EbayTokenResponse> {
  const tokenUrl = getTokenUrl(config.environment);
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: config.redirectUri,
    }).toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay token exchange failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}

export async function refreshAccessToken(
  config: EbayConfig,
  refreshToken: string
): Promise<EbayTokenResponse> {
  const tokenUrl = getTokenUrl(config.environment);
  const credentials = btoa(`${config.clientId}:${config.clientSecret}`);
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: EBAY_SCOPES,
    }).toString(),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay token refresh failed: ${response.status} - ${error}`);
  }
  
  return response.json();
}
