

# Listing Preview for Mass/Bulk eBay Listing

## Overview

Add a "Preview Before Listing" step to the Bulk Listing workflow. When users select items and click "Queue for Sync," they'll first see a preview panel showing exactly how each item will appear on eBay -- title, description, price (with markup), category, condition, matched template, policies, and aspects. This gives admins confidence before committing items to the sync queue.

## What It Looks Like

The preview appears as a dialog/sheet that opens when clicking "Queue for Sync" with items selected. It has two views:

**Summary View (default)** -- A table showing all selected items with their resolved listing data side by side:

```text
+-----------------------------------------------------------------------+
|  Listing Preview - 12 items selected                           [Close] |
+-----------------------------------------------------------------------+
|  [Summary]  [Detail View]                                              |
+-----------------------------------------------------------------------+
| Image | Title (resolved)        | Category    | Condition | Price     |
|-------|-------------------------|-------------|-----------|-----------|
| [img] | 2024 SM Promos Reshir.. | CCG Cards   | Ungraded  | $180.00   |
|       | Template: Raw TCG Card  | via: brand  |           | +0% = $180|
|-------|-------------------------|-------------|-----------|-----------|
| [img] | 2023 Topps Chrome Ot..  | Sports Card | Graded    | $250.00   |
|       | Template: (default)     | via: brand  | PSA 10    | +0% = $250|
+-----------------------------------------------------------------------+
|  Warnings:                                                             |
|  ! 2 items have no price set                                          |
|  ! 1 item has no images                                               |
+-----------------------------------------------------------------------+
|                    [Cancel]    [Confirm & Queue 12 Items]              |
+-----------------------------------------------------------------------+
```

**Detail View** -- Click any row to expand and see the full listing payload:
- Resolved title (with template variables filled in)
- Resolved description (HTML preview)
- Category name + ID
- Condition + condition descriptors (for graded)
- Item aspects (key-value pairs)
- Policies (shipping, payment, return) with names resolved
- Final price calculation (base + markup)
- Images (thumbnails)

## How It Works

The preview runs the same resolution logic that the edge functions use, but client-side. It queries the same database tables (templates, category mappings, categories, policies, store config) and applies the same rules to generate a preview. No edge function call is needed -- this is a read-only simulation.

---

## Technical Details

### New File: `src/components/admin/EbayListingPreview.tsx`

A dialog component that accepts an array of inventory items and the store config, then:

1. Fetches required data in parallel:
   - `ebay_listing_templates` for the store
   - `ebay_category_mappings` for the store
   - `ebay_categories` (active)
   - `ebay_fulfillment_policies`, `ebay_payment_policies`, `ebay_return_policies` for the store

2. For each item, runs client-side resolution:
   - **Category detection**: Checks item's `brand_title` against `ebay_category_mappings.brand_match` arrays (same priority-ordered logic as `detectCategoryFromBrandDB`)
   - **Template resolution**: Matches category mappings > graded status + category > default template (same as `resolveTemplate`)
   - **Title building**: Applies template variables (`{subject}`, `{brand_title}`, etc.) or auto-builds from parts
   - **Description building**: Same template variable substitution
   - **Category ID**: From resolved template or dynamic lookup from `ebay_categories` by `item_type`
   - **Condition**: From template or graded/ungraded default
   - **Aspects**: Builds TCG, sports, or comics aspects based on detected category
   - **Price**: Base price x (1 + markup%)
   - **Policies**: Template policy IDs > store config defaults, with names resolved from the fetched policy lists

3. Displays validation warnings:
   - Items with no price
   - Items with no images
   - Items where no template matched (using defaults)
   - Items with titles exceeding 80 characters (eBay limit)

### New File: `src/lib/ebayPreviewResolver.ts`

A pure client-side module containing the resolution logic (mirrors the edge function logic but runs in the browser):

```typescript
export function detectCategoryFromBrand(brand: string, mappings: CategoryMapping[]): string | null
export function resolveTemplateForItem(item, templates, mappings, categories): ResolvedTemplate
export function buildPreviewTitle(item, template?): string
export function buildPreviewDescription(item, template?): string
export function buildPreviewAspects(item, category): Record<string, string[]>
export function calculateFinalPrice(basePrice, markupPercent): number
```

This avoids duplicating the edge function code by implementing the same algorithm but for client-side preview purposes only. The actual listing still goes through the edge function.

### Modified File: `src/components/admin/EbayBulkListing.tsx`

- Import `EbayListingPreview` component
- Change "Queue for Sync" button behavior: instead of immediately queuing, open the preview dialog
- Pass selected items + store key to the preview
- Preview dialog has a "Confirm & Queue" button that calls the existing `queueForEbaySync` function
- Add a `storeKey` prop usage for fetching store config (already partially passed)

### Modified File: `src/pages/EbayApp.tsx`

- Pass the `selectedConfig` (store config) down to `EbayBulkListing` so it has access to `price_markup_percent` and policy defaults

### Data Types

```typescript
interface ResolvedListing {
  item: InventoryItem;
  title: string;
  description: string;
  categoryId: string;
  categoryName: string;
  conditionId: string;
  conditionName: string;
  detectedType: 'tcg' | 'sports' | 'comics' | null;
  templateName: string | null;
  templateMatchSource: 'brand_mapping' | 'category_mapping' | 'graded_fallback' | 'default' | 'none';
  aspects: Record<string, string[]>;
  basePrice: number;
  finalPrice: number;
  markupPercent: number;
  fulfillmentPolicyName: string | null;
  paymentPolicyName: string | null;
  returnPolicyName: string | null;
  warnings: string[];
  imageUrls: string[];
}
```

### Implementation Order

1. Create `src/lib/ebayPreviewResolver.ts` with the client-side resolution functions
2. Create `src/components/admin/EbayListingPreview.tsx` with the preview dialog UI
3. Update `src/components/admin/EbayBulkListing.tsx` to show preview before queuing
4. Update `src/pages/EbayApp.tsx` to pass store config to bulk listing component

### Key Design Decisions

- **Client-side resolution only** -- No edge function calls needed for preview. The resolution logic is simple enough to run in the browser and avoids unnecessary API calls for potentially hundreds of items.
- **Same algorithm, separate implementation** -- The preview resolver mirrors the edge function logic but is written for browser execution (uses Supabase JS client directly). This is intentional: the preview is an approximation for admin review, not a guarantee. The actual listing still goes through the authoritative edge function.
- **Warning system** -- Highlights potential issues before items are queued, reducing failed listings and wasted API calls.
- **No eBay API calls** -- The preview never touches the eBay API. It only reads from the local database to simulate what would happen.
