import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

/**
 * Validation schema for legacy v2-shopify-send endpoint
 */
export const SendLegacySchema = z.object({
  storeKey: z.enum(['hawaii', 'las_vegas'], {
    errorMap: () => ({ message: 'storeKey must be either "hawaii" or "las_vegas"' })
  }),
  sku: z.string().min(1).max(100, 'SKU must be between 1 and 100 characters'),
  title: z.string().max(255).nullable().optional(),
  price: z.number().min(0).max(999999).nullable().optional(),
  barcode: z.string().max(50).nullable().optional(),
  locationGid: z.string()
    .regex(/^gid:\/\/shopify\/Location\/\d+$/, 'Invalid Shopify location GID format'),
  quantity: z.number().int().min(1).max(10000, 'Quantity must be between 1 and 10000'),
  intakeItemId: z.string().uuid('Invalid intake item ID format').optional()
})

export type SendLegacyInput = z.infer<typeof SendLegacySchema>
