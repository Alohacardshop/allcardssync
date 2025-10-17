// Zod schemas for data validation
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * JustTCG API response schemas
 */
export const JustTcgSet = z.object({
  id: z.string(),
  name: z.string(),
  series: z.string().optional(),
  code: z.string().optional(),
  releaseDate: z.string().optional(),
  total: z.number().optional(),
  printedTotal: z.number().optional(),
  images: z.record(z.string()).optional(),
});

export const JustTcgCard = z.object({
  id: z.string(),
  name: z.string(),
  number: z.string().optional(),
  set: z.string().optional(),
  setId: z.string().optional(),
  rarity: z.string().optional(),
  supertype: z.string().optional(),
  subtypes: z.array(z.string()).optional(),
  images: z.record(z.string()).optional(),
  tcgplayerProductId: z.number().optional(),
  tcgplayerUrl: z.string().optional(),
});

export const JustTcgVariant = z.object({
  id: z.string(),
  cardId: z.string(),
  printing: z.string().optional(),
  condition: z.string().optional(),
  language: z.string().optional(),
  price: z.number().optional(),
  marketPrice: z.number().optional(),
  currency: z.string().optional(),
  sku: z.string().optional(),
});

/**
 * PSA API response schemas
 */
export const PsaCertificate = z.object({
  certNumber: z.string(),
  brand: z.string().optional(),
  category: z.string().optional(),
  subject: z.string().optional(),
  year: z.string().optional(),
  variety: z.string().optional(),
  grade: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).optional(),
});

/**
 * Internal sync job schema
 */
export const SyncJob = z.object({
  game: z.string(),
  setId: z.string(),
  jobType: z.enum(["set_sync", "card_sync", "variant_sync", "backfill"]),
  status: z.enum(["queued", "processing", "done", "error"]),
  priority: z.number().optional().default(0),
});

/**
 * Batch upsert payload schemas
 */
export const BatchCardsPayload = z.object({
  cards: z.array(
    z.object({
      game: z.string(),
      set_id: z.string(),
      card_id: z.string(),
      name: z.string(),
      number: z.string().optional(),
      provider_id: z.string().optional(),
      rarity: z.string().optional(),
      supertype: z.string().optional(),
      subtypes: z.array(z.string()).optional(),
      images: z.record(z.string()).optional(),
      data: z.record(z.unknown()).optional(),
    })
  ),
});

export const BatchVariantsPayload = z.object({
  variants: z.array(
    z.object({
      game: z.string(),
      card_id: z.string(),
      variant_id: z.string(),
      printing: z.string().optional(),
      condition: z.string().optional(),
      language: z.string().optional(),
      price_cents: z.number().optional(),
      sku: z.string().optional(),
    })
  ),
});
