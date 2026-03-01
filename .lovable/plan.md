

## eBay Admin Audit — Issues Found

After reviewing every tab (Settings, Policies, Templates, Categories, Tag Mappings, Sync Rules, Bulk Listing, Queue) and the backend sync processor, here's what's missing or broken:

### 1. Template Editor missing policy dropdowns
The `ebay_listing_templates` table has `fulfillment_policy_id`, `payment_policy_id`, and `return_policy_id` columns, and the resolution chain uses them as highest priority (`template > tag mapping > store config`). But the **Template Manager UI** (`EbayTemplateManager.tsx`) never shows or saves these fields. Templates can't actually override policies despite the backend supporting it.

**Fix:** Add three policy dropdown selectors to the template editor dialog, fetching from the same policy tables. Include them in the `saveTemplate` data.

### 2. `saveConfig` misses `price_markup_percent`
The explicit `saveConfig()` function (lines 414-443) doesn't include `price_markup_percent` in its update payload. The auto-save `updateConfig` (line 602) does include it. `saveConfig` is still called from a "Save" button path — if triggered, it would silently reset markup to whatever was there before.

**Fix:** Add `price_markup_percent: selectedConfig.price_markup_percent` to the `saveConfig` update payload.

### 3. Tag Mappings not scoped to store
`EbayTagCategoryMappings` loads all `tag_category_mappings` rows without filtering by `store_key`. The policy dropdowns also load all policies across all stores. If multiple stores exist, you see policies from other stores and mappings apply globally rather than per-store.

**Fix:** The `tag_category_mappings` table doesn't have a `store_key` column — this is by design (tags are global). But the policy dropdowns should filter by the active store's `store_key`. Pass `storeKey` as a prop to `EbayTagCategoryMappings` and filter policy queries.

### 4. Tag Mappings tab doesn't receive `storeKey`
In `EbayApp.tsx` line 708, `<EbayTagCategoryMappings />` is rendered without any props. It needs the selected store's key to filter policies correctly and to show a "no store selected" message when appropriate.

**Fix:** Pass `storeKey={selectedConfig?.store_key}` and guard rendering like the other tabs do.

### Changes

| File | What |
|------|------|
| `src/components/admin/EbayTemplateManager.tsx` | Add policy dropdown fields (Fulfillment, Payment, Return) to the template editor dialog; include in save payload |
| `src/pages/EbayApp.tsx` | (a) Add `price_markup_percent` to `saveConfig`; (b) Pass `storeKey` to `EbayTagCategoryMappings` |
| `src/components/admin/EbayTagCategoryMappings.tsx` | Accept `storeKey` prop; filter policy queries by store_key |

No database changes or edge function updates needed — this is purely UI fixes to expose what the backend already supports.

