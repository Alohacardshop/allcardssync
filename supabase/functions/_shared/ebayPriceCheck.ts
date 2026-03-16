/**
 * Shared eBay price check utilities for Finding API operations.
 *
 * AUTH: The Finding API uses SECURITY-APPNAME (your eBay Client/App ID)
 * as a query parameter — NOT OAuth Bearer tokens.
 */

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
 * Fetch sold listings from eBay Finding API.
 * Uses SECURITY-APPNAME (Client ID) for authentication — no OAuth token needed.
 */
export async function fetchEbaySoldListings(
  searchQuery: string,
  appId: string
): Promise<number[]> {
  const params = new URLSearchParams({
    'OPERATION-NAME': 'findCompletedItems',
    'SERVICE-VERSION': '1.0.0',
    'SECURITY-APPNAME': appId,
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

  const response = await fetch(url);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[eBay Finding API] Request failed:', response.status, errorText);
    throw new Error(`eBay Finding API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Check for API-level errors
  const ack = data.findCompletedItemsResponse?.[0]?.ack?.[0];
  if (ack === 'Failure') {
    const errorMsg = data.findCompletedItemsResponse?.[0]?.errorMessage?.[0]?.error?.[0]?.message?.[0] || 'Unknown API error';
    console.error('[eBay Finding API] API error:', errorMsg);
    throw new Error(`eBay Finding API: ${errorMsg}`);
  }

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
