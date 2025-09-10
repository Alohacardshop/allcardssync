import { supabase } from "@/integrations/supabase/client"

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

export async function sendToShopify(args: SendArgs){
  const { error, data } = await supabase.functions.invoke("v2-shopify-send", { body: args })
  if (error) throw new Error(error.message)
  return data
}