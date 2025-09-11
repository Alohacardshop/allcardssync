import { supabase } from "@/integrations/supabase/client"

export type SendGradedArgs = {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku?: string
    psa_cert?: string
    barcode?: string
    title?: string
    price?: number
    grade?: string
    quantity?: number
    // Extended metadata for graded title/description/images
    year?: string
    brand_title?: string
    subject?: string
    card_number?: string
    variant?: string
    category_tag?: string
    image_url?: string
    cost?: number
  }
}

export type SendRawArgs = {
  storeKey: "hawaii" | "las_vegas"
  locationGid: string
  item: {
    id?: string
    sku: string
    brand_title?: string
    subject?: string
    card_number?: string
    image_url?: string
    cost?: number
    title?: string
    price?: number
    barcode?: string
    condition?: string
    quantity?: number
  }
}

export async function sendGradedToShopify(args: SendGradedArgs) {
  const { error, data } = await supabase.functions.invoke("v2-shopify-send-graded", { body: args })
  if (error) throw new Error(error.message)
  return data
}

export async function sendRawToShopify(args: SendRawArgs) {
  const { error, data } = await supabase.functions.invoke("v2-shopify-send-raw", { body: args })
  if (error) throw new Error(error.message)
  return data
}

// Legacy function - kept for compatibility but deprecated
export type SendArgs = {
  storeKey: "hawaii" | "las_vegas"
  sku: string
  title?: string | null
  price?: number | null
  barcode?: string | null
  locationGid: string
  quantity: number
  intakeItemId?: string
}

export async function sendToShopify(args: SendArgs) {
  const { error, data } = await supabase.functions.invoke("v2-shopify-send", { body: args })
  if (error) throw new Error(error.message)
  return data
}