import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

/**
 * Validation schema for SendGradedArgs
 */
export const SendGradedSchema = z.object({
  storeKey: z.enum(['hawaii', 'las_vegas'], {
    errorMap: () => ({ message: 'storeKey must be either "hawaii" or "las_vegas"' })
  }),
  locationGid: z.string()
    .regex(/^gid:\/\/shopify\/Location\/\d+$/, 'Invalid Shopify location GID format'),
  vendor: z.string().max(100).optional(),
  item: z.object({
    id: z.string().uuid('Invalid item ID format'),
    sku: z.string().min(1).max(100).optional(),
    psa_cert: z.string().max(20).optional(),
    barcode: z.string().max(50).optional(),
    title: z.string().max(255).optional(),
    price: z.number().min(0).max(999999).optional(),
    grade: z.string().max(20).optional(),
    quantity: z.number().int().min(1).max(10000).optional(),
    year: z.string().max(10).optional(),
    brand_title: z.string().max(200).optional(),
    subject: z.string().max(500).optional(),
    card_number: z.string().max(50).optional(),
    variant: z.string().max(200).optional(),
    category_tag: z.string().max(100).optional(),
    image_url: z.string().url().max(2000).optional(),
    cost: z.number().min(0).max(999999).optional()
  })
})

/**
 * Validation schema for SendRawArgs
 */
export const SendRawSchema = z.object({
  item_id: z.string().uuid('Invalid item ID format'),
  vendor: z.string().max(100).optional()
})

/**
 * Type inference for validated data
 */
export type SendGradedInput = z.infer<typeof SendGradedSchema>
export type SendRawInput = z.infer<typeof SendRawSchema>
