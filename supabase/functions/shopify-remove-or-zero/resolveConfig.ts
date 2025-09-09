// Shared Shopify configuration resolver for all Edge Functions
// This provides a single source of truth for credentials with comprehensive fallbacks

export interface ShopifyCredentials {
  domain: string;
  accessToken: string;
}

export type ShopifyConfigError = 
  | 'MISSING_DOMAIN'
  | 'MISSING_TOKEN' 
  | 'UNKNOWN_STORE'
  | 'DATABASE_ERROR';

export interface ShopifyConfigResult {
  success: true;
  credentials: ShopifyCredentials;
  diagnostics: {
    storeKey: string;
    domainSource: string;
    tokenSource: string;
    domainUsed: string;
    matchedTokenKey: string; // redacted for security
  };
}

export interface ShopifyConfigFailure {
  success: false;
  code: ShopifyConfigError;
  message: string;
  diagnostics?: {
    storeKey: string;
    searchedDomainKeys: string[];
    searchedTokenKeys: string[];
    foundKeys: string[];
  };
}

export type ShopifyConfigReturn = ShopifyConfigResult | ShopifyConfigFailure;

/**
 * Resolves Shopify configuration for a given store key with comprehensive fallbacks
 * @param supabase - Supabase client instance
 * @param storeKey - Store identifier (e.g., 'hawaii', 'las_vegas')
 * @returns Promise<ShopifyConfigReturn>
 */
export async function resolveShopifyConfig(
  supabase: any, 
  storeKey: string
): Promise<ShopifyConfigReturn> {
  const upper = storeKey.toUpperCase();

  // Define all possible domain key patterns (in priority order)
  const domainKeys = [
    `SHOPIFY_${upper}_STORE_DOMAIN`,      // Current standard: SHOPIFY_HAWAII_STORE_DOMAIN
    `SHOPIFY_${upper}_DOMAIN`,            // Legacy variant: SHOPIFY_HAWAII_DOMAIN
    `SHOPIFY_STORE_DOMAIN_${upper}`,      // Legacy variant: SHOPIFY_STORE_DOMAIN_HAWAII
    'SHOPIFY_STORE_DOMAIN'                // Global fallback
  ];

  // Define all possible access token key patterns (in priority order)
  const tokenKeys = [
    `SHOPIFY_${upper}_ACCESS_TOKEN`,           // Current standard: SHOPIFY_HAWAII_ACCESS_TOKEN
    `SHOPIFY_ADMIN_ACCESS_TOKEN_${upper}`,     // Legacy pattern A: SHOPIFY_ADMIN_ACCESS_TOKEN_HAWAII
    `SHOPIFY_${upper}_ADMIN_ACCESS_TOKEN`,     // Legacy pattern B: SHOPIFY_HAWAII_ADMIN_ACCESS_TOKEN
    'SHOPIFY_ADMIN_ACCESS_TOKEN',              // Global fallback
    `SHOPIFY_ACCESS_TOKEN_${upper}`            // Another legacy variant
  ];

  try {
    // Fetch all potential settings from system_settings table
    const { data: settings, error: settingsError } = await supabase
      .from('system_settings')
      .select('key_name, key_value')
      .in('key_name', [...domainKeys, ...tokenKeys]);

    if (settingsError) {
      return {
        success: false,
        code: 'DATABASE_ERROR',
        message: 'Failed to query system settings'
      };
    }

    const settingsMap = new Map<string, string>();
    (settings || []).forEach(s => {
      const value = s.key_value?.trim();
      if (value) {
        settingsMap.set(s.key_name, value);
      }
    });

    // Helper to find first matching value from key priority list
    const findFirstMatch = (keys: string[]): { value: string | null; source: string | null } => {
      for (const key of keys) {
        const value = settingsMap.get(key);
        if (value) {
          return { value, source: key };
        }
      }
      return { value: null, source: null };
    };

    // Resolve domain
    let domain: string | null = null;
    let domainSource = 'system_settings';
    let domainKey: string | null = null;

    const domainMatch = findFirstMatch(domainKeys);
    if (domainMatch.value) {
      domain = domainMatch.value;
      domainKey = domainMatch.source;
    } else {
      // Fallback to shopify_stores table
      const { data: storeData } = await supabase
        .from('shopify_stores')
        .select('domain')
        .eq('key', storeKey)
        .single();
      
      if (storeData?.domain?.trim()) {
        domain = storeData.domain.trim();
        domainSource = 'shopify_stores_table';
        domainKey = 'shopify_stores.domain';
      }
    }

    // Resolve access token
    const tokenMatch = findFirstMatch(tokenKeys);
    const accessToken = tokenMatch.value;
    const tokenKey = tokenMatch.source;

    // Validate results
    if (!domain) {
      return {
        success: false,
        code: 'MISSING_DOMAIN',
        message: `Store domain not found for '${storeKey}'. Please configure one of: ${domainKeys.join(', ')}`,
        diagnostics: {
          storeKey,
          searchedDomainKeys: domainKeys,
          searchedTokenKeys: tokenKeys,
          foundKeys: Array.from(settingsMap.keys())
        }
      };
    }

    if (!accessToken) {
      return {
        success: false,
        code: 'MISSING_TOKEN',
        message: `Access token not found for '${storeKey}'. Please configure one of: ${tokenKeys.join(', ')}`,
        diagnostics: {
          storeKey,
          searchedDomainKeys: domainKeys,
          searchedTokenKeys: tokenKeys,
          foundKeys: Array.from(settingsMap.keys())
        }
      };
    }

    // Success - return credentials with diagnostics
    return {
      success: true,
      credentials: {
        domain,
        accessToken
      },
      diagnostics: {
        storeKey,
        domainSource,
        tokenSource: 'system_settings',
        domainUsed: domain,
        matchedTokenKey: '<redacted>' // Never log actual tokens
      }
    };

  } catch (error) {
    return {
      success: false,
      code: 'DATABASE_ERROR',
      message: `Database error while resolving config: ${error.message}`
    };
  }
}