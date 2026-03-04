

## Verification: Shopify Sync Store Routing

After reviewing the codebase, both stores can still sync to Shopify and each routes to its own Shopify store correctly. No code changes are needed.

### How store routing works

1. Every `intake_item` has a `store_key` column (`hawaii` or `las_vegas`).
2. When syncing, the `store_key` is passed to `shopifyGraphQL(storeKey, ...)` which looks up credentials from the `shopify_stores` table by `key`.
3. The `shopify_stores` table maps each key to its own domain (`aloha-card-shop.myshopify.com` for Hawaii, `vqvxdi-ar.myshopify.com` for Las Vegas).
4. Edge functions (`v2-shopify-send-graded`, `v2-shopify-send-raw`, `shopify-update-product`, etc.) all receive `storeKey` and look up `SHOPIFY_{STORE}_STORE_DOMAIN` and `SHOPIFY_{STORE}_ACCESS_TOKEN` from `system_settings`.

### The removed toggle has no impact

The `services.shopify_sync` setting was **only defined as a TypeScript type** in `useRegionSettings.ts`. It was never actually checked as a gate before any Shopify sync operation. The sync pipeline (queue_shopify_sync RPC, edge functions, webhook handlers) has no conditional check for this setting — Shopify sync is always-on by design.

### Summary

- Hawaii items sync to `aloha-card-shop.myshopify.com`
- Las Vegas items sync to `vqvxdi-ar.myshopify.com`
- No service toggle gates Shopify sync — removing the UI toggle changes nothing
- No code changes required

