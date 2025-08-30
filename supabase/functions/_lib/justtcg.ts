// JustTCG API utilities - shared between edge functions
import { fetchWithRetry } from "../_shared/http.ts";

export { logStructured } from "../_shared/log.ts";

// Configuration
const JUSTTCG_BASE = "https://api.justtcg.com/v2";

interface ApiResponse {
  data: any[];
  error?: string;
  pagination?: any;
}

/**
 * Fetch cards by IDs from JustTCG API with analytics sorting
 */
export async function postCardsByIds(cardIds: string[], apiKey: string, sortBy = '24h'): Promise<ApiResponse> {
  if (!cardIds.length) {
    return { data: [] };
  }

  const url = `${JUSTTCG_BASE}/cards/bulk`;
  const body = {
    ids: cardIds,
    sort: sortBy,
    include_variants: true,
    include_analytics: true
  };

  try {
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Supabase-Edge-Function'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();
    return {
      data: result.data || [],
      pagination: result.pagination
    };
    
  } catch (error) {
    return {
      data: [],
      error: error instanceof Error ? error.message : 'Unknown API error'
    };
  }
}