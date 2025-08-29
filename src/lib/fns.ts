import { supabase } from "@/integrations/supabase/client";

/**
 * Get catalog sync status - DEPRECATED
 * TODO: Replace with API call to alohacardshopcarddatabase
 */
export async function getCatalogSyncStatus(game: string, limit: number = 50) {
  // Catalog sync functionality moved to external service
  throw new Error('Catalog sync functionality moved to Alohacardshop/alohacardshopcarddatabase');
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