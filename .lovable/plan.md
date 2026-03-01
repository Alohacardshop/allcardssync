

## Add Per-Category Policies and Markup to Tag Mappings

Right now, the `tag_category_mappings` table only stores tag, category, condition, and eBay category ID. Policies and markup are either global (from `ebay_store_config`) or per-template. You want per-category control over policies and markup directly from the Tag Mappings UI.

### What changes

**1. Add columns to `tag_category_mappings`**
- `fulfillment_policy_id` (text, nullable)
- `payment_policy_id` (text, nullable)
- `return_policy_id` (text, nullable)
- `price_markup_percent` (numeric, nullable)

When these are set, they override the store-wide defaults for items matching that category.

**2. Update `ebay-sync-processor/index.ts` policy resolution**

Current priority: template policies > store config defaults.

New priority: **template policies > tag mapping policies > store config defaults**.

After resolving the template, look up the item's `primary_category` in `tag_category_mappings` and use its policy IDs / markup if the template doesn't specify them.

**3. Update the Tag Mappings UI (`EbayTagCategoryMappings.tsx`)**

Add columns for:
- Fulfillment Policy (dropdown of synced policies from `ebay_fulfillment_policies`)
- Payment Policy (dropdown from `ebay_payment_policies`)
- Return Policy (dropdown from `ebay_return_policies`)
- Markup % (number input)

Each row becomes a full category configuration: tag → category → eBay category ID → policies → markup.

### Files to change
- **New migration** — add 4 columns to `tag_category_mappings`
- **`src/components/admin/EbayTagCategoryMappings.tsx`** — add policy dropdowns + markup input, fetch policy lists
- **`supabase/functions/ebay-sync-processor/index.ts`** — insert tag-mapping policy/markup lookup into the resolution chain
- **Deploy** `ebay-sync-processor`

