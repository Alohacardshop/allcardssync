/**
 * Real Shopify GraphQL client implementation
 */

import { supabase } from "@/integrations/supabase/client";

interface ShopifyStore {
  domain: string;
  api_version: string;
}

// Get store credentials from system settings (encrypted)
export async function getShopifyStore(storeKey: string): Promise<ShopifyStore> {
  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('domain, api_version')
    .eq('key', storeKey)
    .maybeSingle();
    
  if (error) throw new Error(`Failed to fetch store: ${error.message}`);
  if (!store) throw new Error(`Store '${storeKey}' not found. Please check your Shopify configuration.`);
  
  return {
    domain: store.domain,
    api_version: store.api_version || '2024-01'
  };
}

// Get encrypted access token for store
async function getStoreAccessToken(storeKey: string): Promise<string> {
  // Call edge function to get decrypted token
  const { data, error } = await supabase.functions.invoke('get-decrypted-system-setting', {
    body: { key_name: `SHOPIFY_ACCESS_TOKEN_${storeKey}` }
  });
  
  if (error) throw new Error(`Failed to get access token: ${error.message}`);
  if (!data?.value) throw new Error(`No access token found for store: ${storeKey}`);
  
  return data.value;
}

// Execute GraphQL query against Shopify with rate limiting and retry
export async function shopifyGraphQL(
  storeKey: string,
  query: string, 
  variables: Record<string, any> = {}
): Promise<any> {
  const store = await getShopifyStore(storeKey);
  const accessToken = await getStoreAccessToken(storeKey);
  
  const response = await fetch(
    `https://${store.domain}/admin/api/${store.api_version}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  
  // Handle rate limiting
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const delay = retryAfter ? parseInt(retryAfter) * 1000 : 2000;
    
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Retry once after rate limit delay
    return shopifyGraphQL(storeKey, query, variables);
  }
  
  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status} ${response.statusText}`);
  }
  
  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  // Check for userErrors in the response
  const operation = Object.keys(result.data || {})[0];
  if (operation && result.data[operation]?.userErrors?.length > 0) {
    const userErrors = result.data[operation].userErrors;
    throw new Error(`Shopify userErrors: ${JSON.stringify(userErrors)}`);
  }
  
  return result;
}
