/**
 * Type augmentation for Supabase RPC functions not yet in auto-generated types
 * This file extends the Database type with additional function signatures
 * 
 * TEMPORARY FILE: Can be deleted once types are regenerated via:
 * npx supabase gen types typescript --project-id dmpoandoydaqxhzdjnmk > src/integrations/supabase/types.ts
 * 
 * This provides type safety for functions that exist in the database but aren't
 * yet reflected in the auto-generated types file.
 */

import type { Database } from './types';

export interface DatabaseFunctionsExtended extends Database {
  public: Database['public'] & {
    Functions: Database['public']['Functions'] & {
      send_and_queue_inventory: {
        Args: { item_ids: string[] }
        Returns: {
          processed: number
          processed_ids: string[]
          rejected: Array<{
            id: string
            reason: string
          }>
        }
      }
    }
  }
}
