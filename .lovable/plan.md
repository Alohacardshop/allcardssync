

## Filter Out Inactive Shopify Locations

**Problem**: Inactive Shopify locations like "702" and "702 Cards" appear in the location selector because the system doesn't filter by the `active` flag from Shopify's API.

**Fix**: Filter locations by `active: true` in two places:

1. **`supabase/functions/shopify-locations/index.ts`** — Filter the returned locations array to only include active ones before caching and returning:
   ```
   const locations = (data.locations || []).filter(l => l.active);
   ```

2. **`supabase/functions/fetch-shopify-locations/index.ts`** — Same filter applied here (this is the other location-fetching function).

3. **`shopify_location_cache` cleanup** — Remove any already-cached inactive locations (702/702 Cards) from the cache table so they don't persist.

This is a small, surgical change — just adding `.filter(l => l.active)` before the locations are cached and returned, and cleaning up stale cache entries.

