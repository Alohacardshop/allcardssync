

## Review and Fix eBay Admin + Tag Mapping Integration

After auditing the full eBay admin system, I found several gaps where the tag mapping system isn't fully integrated.

### Issues Found

**1. Client-side preview resolver ignores tag mappings**
The `ebayPreviewResolver.ts` resolves policies as `template > store config`, but the backend (`ebay-sync-processor`) does `template > tag mapping > store config`. This means the preview shows different policies/markup than what actually gets listed.

**2. Preview resolver doesn't use `primary_category` from item**
The preview only detects category via brand matching. It misses the `primary_category` field that the DB trigger sets from tag mappings — so items categorized by tags (e.g., "pokemon" tag → `primary_category: 'pokemon'`) won't resolve correctly in preview.

**3. Tag Mappings UI uses raw text input for eBay Category ID**
There's already an `EbayCategorySelect` combobox (searchable, validated against the managed registry) used in templates and sync rules. The tag mappings should use it too instead of a raw text input.

**4. Unnecessary `as any` casts in Tag Mappings component**
The `tag_category_mappings` table is already in the generated types. The `as any` casts can be removed for type safety.

### Changes

**`src/lib/ebayPreviewResolver.ts`**
- Add `tag_category_mappings` data as a new parameter to `resolveListingPreview`
- Use item's `primary_category` (from tag-derived DB trigger) in category detection, not just brand matching
- Insert tag mapping policy/markup into the resolution chain: `template > tag mapping > store config`

**`src/components/admin/EbayListingPreview.tsx`**
- Fetch `tag_category_mappings` and pass to the resolver

**`src/components/admin/EbayTagCategoryMappings.tsx`**
- Replace the raw text input for eBay Category ID with the `EbayCategorySelect` combobox
- Remove `as any` casts — use proper typed queries
- Add `primary_category` to `PreviewItem` interface for the resolver

**`src/components/admin/EbayBulkListing.tsx`**
- Pass tag mappings data to the preview resolver (if it calls `resolveListingPreview`)

