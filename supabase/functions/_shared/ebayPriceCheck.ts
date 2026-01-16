/**
 * Shared eBay price check utilities for Finding API operations
 */

// In-memory token cache (reused across function invocations)
interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

/**
 * Get eBay OAuth token using client credentials flow
 * Caches token in memory to avoid redundant requests
 */
export async function getEbayOAuthToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    console.log('[eBay OAuth] Using cached token');
    return cachedToken.token;
  }

  console.log('[eBay OAuth] Fetching new token');
  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eBay OAuth] Token request failed:', response.status, errorText);
    throw new Error(`OAuth token request failed: ${response.statusText}`);
  }

  const data = await response.json();

  // Cache token (tokens typically expire after 2 hours)
  // Set expiry 5 minutes before actual expiry for safety
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  console.log('[eBay OAuth] New token cached, expires in', data.expires_in, 'seconds');
  return data.access_token;
}

/**
 * Remove price outliers using ±30% threshold
 * Returns average of remaining prices
 */
export function removeOutliers(prices: number[]): {
  average: number;
  used: number[];
  outliers: number[];
} {
  if (prices.length === 0) {
    return { average: 0, used: [], outliers: [] };
  }

  if (prices.length <= 3) {
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;
    return { average, used: prices, outliers: [] };
  }

  // Calculate initial average
  const initialAvg = prices.reduce((a, b) => a + b, 0) / prices.length;

  // Remove outliers (±30%)
  const threshold = initialAvg * 0.3;
  const filtered = prices.filter(
    (p) => p >= initialAvg - threshold && p <= initialAvg + threshold
  );

  // Keep at least 3 prices
  const usedPrices = filtered.length >= 3 ? filtered : prices.slice(0, 3);
  const outliers = prices.filter((p) => !usedPrices.includes(p));

  const finalAvg = usedPrices.reduce((a, b) => a + b, 0) / usedPrices.length;

  return { average: finalAvg, used: usedPrices, outliers };
}

/**
 * Fetch sold listings from eBay Finding API
 * Returns array of sold prices
 */
export async function fetchEbaySoldListings(
  searchQuery: string,
  oauthToken: string
): Promise<number[]> {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'RESPONSE-DATA-FORMAT': 'JSON',
    'REST-PAYLOAD': '',
    keywords: searchQuery,
    'itemFilter(0).name': 'SoldItemsOnly',
    'itemFilter(0).value': 'true',
    'itemFilter(1).name': 'ListingType',
    'itemFilter(1).value': 'FixedPrice',
    sortOrder: 'EndTimeSoonest',
    'paginationInput.entriesPerPage': '5',
  });

  const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${oauthToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eBay API] Request failed:', response.status, errorText);
    throw new Error(`eBay API error: ${response.statusText}`);
  }

  const data = await response.json();

  // Extract sold prices from response
  const searchResult = data.findCompletedItemsResponse?.[0]?.searchResult?.[0];
  if (!searchResult || searchResult['@count'] === '0') {
    return [];
  }

  const items = searchResult.item || [];
  const prices: number[] = [];

  for (const item of items) {
    const sellingStatus = item.sellingStatus?.[0];
    if (sellingStatus?.sellingState?.[0] === 'EndedWithSales') {
      const priceValue = sellingStatus.currentPrice?.[0]?.__value__;
      if (priceValue) {
        prices.push(parseFloat(priceValue));
      }
    }
  }

  return prices;
}
