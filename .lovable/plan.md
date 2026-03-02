

## Root Cause

The `v2-shopify-send-graded` function reads Shopify credentials from **environment variables** (`Deno.env.get()`), looking for `SHOPIFY_HAWAII_STORE_DOMAIN` and `SHOPIFY_HAWAII_ACCESS_TOKEN`. These are **not configured as edge function secrets** (none of the 21 secrets are Shopify-related).

Meanwhile, the `shopify-resync-inventory` function correctly reads credentials from the **`system_settings` database table**, where values like `SHOPIFY_HAWAII_STORE_DOMAIN` and `SHOPIFY_HAWAII_ACCESS_TOKEN` do exist.

This is the mismatch:
- `v2-shopify-send-graded` → `Deno.env.get()` → **missing** → "Missing Shopify credentials for hawaii"
- `shopify-resync-inventory` → `system_settings` table → **works**

## Two Flows Called "Resync"

There are actually two different resync paths:

1. **Resync button on individual items** (`useInventoryMutations.resyncMutation`) → calls `sendGradedToShopify` → invokes `v2-shopify-send-graded` → **this is what's failing** (re-pushes the product to Shopify)
2. **Bulk resync inventory levels** (`useShopifyResync`) → invokes `shopify-resync-inventory` → pulls quantity from Shopify GraphQL (this one works because it reads creds from `system_settings`)

## Fix

Update `v2-shopify-send-graded` to read Shopify credentials from the `system_settings` table instead of `Deno.env.get()`, matching the pattern used by `shopify-resync-inventory` and other working functions.

Replace lines 84-93 in `v2-shopify-send-graded/index.ts`:

```typescript
// Before (broken):
const domainKey = `SHOPIFY_${storeUpper}_STORE_DOMAIN`
const tokenKey = `SHOPIFY_${storeUpper}_ACCESS_TOKEN`
const domain = Deno.env.get(domainKey)
const token = Deno.env.get(tokenKey)

// After (fixed):
const { data: domainSetting } = await supabase
  .from('system_settings')
  .select('key_value')
  .eq('key_name', `SHOPIFY_${storeUpper}_STORE_DOMAIN`)
  .single()

const { data: tokenSetting } = await supabase
  .from('system_settings')
  .select('key_value')
  .eq('key_name', `SHOPIFY_${storeUpper}_ACCESS_TOKEN`)
  .single()

const domain = domainSetting?.key_value
const token = tokenSetting?.key_value
```

Then redeploy `v2-shopify-send-graded`.

I should also audit `v2-shopify-send-raw` for the same issue, since it likely has the same `Deno.env.get()` pattern and would break for the same reason.

