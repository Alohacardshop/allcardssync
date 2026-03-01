

## Consolidate eBay Admin Tabs

After reviewing what each tab does, here's the breakdown:

| Tab | Purpose |
|-----|---------|
| **Category Mappings** | "If brand/keyword matches X → use eBay category Y + template Z" |
| **Tag Mappings** | "If Shopify tag is X → set primary_category Y, condition Z, eBay category W, policies, markup" |
| **Sync Rules** | "Should this item be listed on eBay at all?" (include/exclude filtering) |
| **Categories** | Registry of valid eBay categories (import from API, toggle active) |

### What can merge

**Category Mappings + Tag Mappings → "Routing Rules"**

Both answer the same question: *"How should this item be listed?"* — they just trigger on different signals (brand/keyword vs Shopify tag). Merging them into a single "Routing Rules" tab with a unified table makes sense:
- Each rule has a **match type** (tag, brand, keyword/regex)
- Each rule maps to: eBay category, template, policies, markup, condition
- Priority ordering resolves conflicts (same as today)
- One place to see all routing logic instead of two

### What should stay separate

- **Sync Rules** — fundamentally different concern (whether to list vs how to list). Combining would confuse the UI.
- **Categories** — it's a reference registry, not a routing config. Stays as-is.

### Proposed tab layout (8 → 7 tabs)

Settings | Policies | Templates | Categories | **Routing Rules** | Sync Rules | Bulk Listing | Sync Queue

### Changes

**New component: `EbayRoutingRules.tsx`**
- Unified table showing all routing rules (from both `tag_category_mappings` and `ebay_category_mappings`)
- Each row shows: match type badge (Tag/Brand/Keyword), match value, eBay category, template, policies, markup, priority, active toggle
- Add/edit dialog with match type selector that shows relevant fields
- Both data sources queried and displayed together, sorted by priority

**`src/pages/EbayApp.tsx`**
- Replace the two tabs (Categories Mappings inside templates tab + Tag Mappings tab) with one "Routing Rules" tab
- Remove the old `EbayCategoryMappingEditor` render from wherever it's embedded

**Backend: no changes needed**
- Keep both tables (`tag_category_mappings` and `ebay_category_mappings`) as-is
- The new component just writes to the correct table based on match type
- Sync processor resolution chain stays the same

