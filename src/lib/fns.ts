import { supabase } from "@/integrations/supabase/client";

/**
 * NOTE: Catalog sync functionality has been moved to external service
 * See: https://github.com/Alohacardshop/alohacardshopcarddatabase
 * This file now only contains error parsing utilities.
 */

/**
 * Parse error responses from Supabase function calls to extract server-provided error messages
 */
import { APIError, SupabaseError } from "@/types/errors"

export function parseFunctionError(error: APIError | SupabaseError | Error | unknown): string {
  if (!error) return 'Unknown error';
  
  // If it's already a string, return it
  if (typeof error === 'string') return error;
  
  // Type guard for objects with message property
  if (error && typeof error === 'object' && 'message' in error) {
    const errorWithMessage = error as { message: string }
    
    // Try to parse JSON error responses from server
    if (typeof errorWithMessage.message === 'string' && errorWithMessage.message.includes('{')) {
      try {
        const match = errorWithMessage.message.match(/(\{.+\})/);
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
    return errorWithMessage.message;
  }
  
  // Type guard for objects with error property
  if (error && typeof error === 'object' && 'error' in error) {
    const errorWithError = error as { error: string | Record<string, unknown> }
    return typeof errorWithError.error === 'string' ? errorWithError.error : JSON.stringify(errorWithError.error);
  }
  
  // Fall back to stringifying the whole error
  return JSON.stringify(error);
}