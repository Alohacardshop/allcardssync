import { supabase } from "@/integrations/supabase/client";

/**
 * Get catalog sync status using query string parameters (not JSON body)
 * This is the correct way to call the catalog-sync-status function
 */
export async function getCatalogSyncStatus(game: string, limit: number = 50) {
  try {
    // Get current user session for JWT token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No authentication token available');
    }

    // Use fetch with query parameters instead of supabase.functions.invoke with body
    const url = `https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/catalog-sync-status?game=${encodeURIComponent(game)}&limit=${limit}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }
      
      throw new Error(errorMessage);
    }

    const data = await response.json();
    return { data, error: null };
    
  } catch (error: any) {
    return { data: null, error };
  }
}

/**
 * Parse error responses from Supabase function calls to extract server-provided error messages
 */
export function parseFunctionError(error: any): string {
  if (!error) return 'Unknown error';
  
  // If it's already a string, return it
  if (typeof error === 'string') return error;
  
  // Check for nested error message
  if (error.message) {
    // Try to parse JSON error responses from server
    if (typeof error.message === 'string' && error.message.includes('{')) {
      try {
        const match = error.message.match(/(\{.+\})/);
        if (match) {
          const errorData = JSON.parse(match[1]);
          if (errorData.error) {
            return errorData.error;
          }
        }
      } catch (e) {
        // Fall back to original message
      }
    }
    return error.message;
  }
  
  // Check for direct error property
  if (error.error) {
    return typeof error.error === 'string' ? error.error : JSON.stringify(error.error);
  }
  
  // Fall back to stringifying the whole error
  return JSON.stringify(error);
}