

## Rename "Routing Rules" → "Mapping Rules"

Simple text rename across 2 files to align terminology with Shopify's "mapping" language.

### Changes

**`src/pages/EbayApp.tsx`**
- Tab label: "Routing Rules" → "Mapping Rules"
- Comment: "Routing Rules Tab" → "Mapping Rules Tab"

**`src/components/admin/EbayRoutingRules.tsx`**
- Card title: "Routing Rules" → "Mapping Rules"
- Card description: "routed to" → "mapped to"
- Empty state text: "No routing rules configured" → "No mapping rules configured"

No backend changes needed — this is purely a UI label rename. The component file name (`EbayRoutingRules.tsx`) can stay as-is to avoid unnecessary refactoring.

