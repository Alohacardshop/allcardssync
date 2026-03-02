

## Plan: Rebuild `ebay-manage-location` and Add Error 25002 Guard

### 1. Rewrite `supabase/functions/ebay-manage-location/index.ts`

**GET** — Verify the configured `location_key` exists on eBay:
- Read `location_key` from `ebay_store_config`
- Call `GET /sell/inventory/v1/location/{location_key}` (not the list endpoint)
- Return the location details if found, or the eBay error if not

**POST** — Register/update the location on eBay:
- Accept address fields from request body: `addressLine1`, `addressLine2?`, `city`, `stateOrProvince`, `postalCode`, `country`
- Accept optional `name` (default `"Aloha Card Shop"`), `locationTypes` (default `["STORE"]`), `merchantLocationStatus` (default `"ENABLED"`)
- Use `location_key` from `ebay_store_config` as the `merchantLocationKey`
- Call `POST /sell/inventory/v1/location/{location_key}`
- Return eBay response JSON on success, or `errorId` + message on failure

Authentication: `verify_jwt = false` with in-code auth guard using `getClaims()`.

### 2. Update `supabase/config.toml`

Change `verify_jwt = true` → `verify_jwt = false` for `ebay-manage-location`.

### 3. Add error 25002 guard in `_shared/ebayApi.ts` → `createOffer()`

When `createOffer` fails, parse the eBay error JSON. If it contains `errorId: 25002`, return a specific error message:
```
"Merchant location not registered on eBay. Run ebay-manage-location POST to register location_key: <key>. Original error: ..."
```

This surfaces in both `ebay-create-listing` and `ebay-sync-processor` since they both call `createOffer()`.

### Files to change
- **Rewrite**: `supabase/functions/ebay-manage-location/index.ts`
- **Edit**: `supabase/config.toml` (line 213: `verify_jwt = true` → `false`)
- **Edit**: `supabase/functions/_shared/ebayApi.ts` — `createOffer()` error handling (~lines 220-227)

