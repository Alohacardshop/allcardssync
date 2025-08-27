import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Validation schema for refresh requests
export const RefreshSchema = z.object({
  // Either IDs or game/set params (mutually exclusive)
  ids: z.array(z.string()).optional(),
  game: z.string().optional(),
  set: z.string().optional(),
  
  // Basic sorting options (for both modes)
  orderBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
  
  // Analytics sorting (for ID mode)
  cardSortBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  cardSortOrder: z.enum(['asc', 'desc']).optional(),
  variantSortBy: z.enum(['price', '24h', '7d', '30d']).optional(),
  variantSortOrder: z.enum(['asc', 'desc']).optional(),
  
  // Limit for list mode
  limit: z.number().min(1).max(200).optional(),
}).refine(
  (data) => {
    // Either ids OR game must be provided (mutually exclusive)
    return Boolean(data.ids?.length) !== Boolean(data.game);
  },
  {
    message: "Either 'ids' array or 'game' parameter must be provided (mutually exclusive)"
  }
);

export type RefreshParams = z.infer<typeof RefreshSchema>;