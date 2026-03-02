

## Diagnosis

Both `v2-shopify-send-graded` and `v2-shopify-send-raw` have the correct code in their source files:
- **Credential fix**: Both read from the `system_settings` database table (not `Deno.env.get()`)
- **Variable rename**: `cardVariant` is used instead of `variant` (no naming conflict)
- **Credentials exist**: `SHOPIFY_HAWAII_STORE_DOMAIN` and `SHOPIFY_HAWAII_ACCESS_TOKEN` are present in `system_settings`

However, the **deployed versions are stale**. The edge function logs show errors referencing line numbers from the old code, confirming the latest source was never successfully deployed.

## Fix

Redeploy both edge functions:
1. `v2-shopify-send-graded`
2. `v2-shopify-send-raw`

No code changes needed — the source is already correct. This is a deployment-only fix.

## Verification

After deployment, check the edge function logs to confirm:
- No boot errors (the `variant` conflict is resolved)
- No "Missing Shopify credentials" errors (credentials are read from the database)

