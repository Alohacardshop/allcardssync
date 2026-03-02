

## Complete Pipeline Review: Intake → Shopify → eBay

I traced the full flow for graded comics and found **two critical bugs** that will cause failures when listing PSA-graded comics on eBay. The Shopify path looks clean.

---

### Pipeline Summary

```text
1. INTAKE (manual or PSA lookup)
   └─ Item created in intake_items
   └─ DB trigger: normalize_shopify_tags → normalized_tags, primary_category, condition_type

2. SHOPIFY SYNC (v2-shopify-send-graded)
   └─ Creates product on Shopify with metafields, tags, inventory
   └─ Updates intake_items with shopify_product_id, variant_id, sync status

3. EBAY SYNC
   a. Sync Rules (ebay-apply-sync-rules) → sets list_on_ebay flag
   b. Queue entry created in ebay_sync_queue
   c. Processor (ebay-sync-processor, cron every 3m) picks up queued items
      └─ resolveTemplate() — NEW: tag_match is Step 0 (highest priority)
      └─ buildTitle / buildDescription from template or auto-generate
      └─ buildCategoryAwareAspects → TCG / Sports / Comics builder
      └─ buildConditionDescriptors → card or comic descriptors
      └─ eBay API: create inventory item → create offer → publish
```

---

### Bug 1: PSA Not in Comic Grader Map (CRITICAL)

**File:** `supabase/functions/_shared/ebayConditions.ts`

The `EBAY_COMIC_GRADER_IDS` map only has `CGC`, `CBCS`, `PGX`, `EGS`. **PSA is missing.** Your test item is a PSA-graded comic (Amazing Spider-Man PSA 10.0). When the sync processor calls `buildComicConditionDescriptors('PSA', '10.0', '146094215')`, the grader descriptor will be empty — eBay will likely reject the listing or list it without proper grading info.

**Fix:** Add `'PSA': '400021'` (or the correct eBay comic grader ID for PSA) to `EBAY_COMIC_GRADER_IDS`. Need to verify the correct eBay descriptor value for PSA in the comics category.

---

### Bug 2: Comic Aspects Miss PSA Cert Number (CRITICAL)

**File:** `supabase/functions/_shared/ebayConditions.ts` — `buildComicAspects()`

The comic aspects builder only checks `item.cgc_cert` for the Certification Number aspect. PSA-graded comics have `psa_cert` instead. The same issue exists in `src/lib/ebayPreviewResolver.ts` — `buildComicAspects()`.

**Fix:** Update both backend and client-side `buildComicAspects` to check `item.psa_cert || item.cgc_cert`.

---

### What's Working Correctly

- **Tag matching in templates:** The `resolveTemplate()` function correctly implements Step 0 tag matching with AND logic and most-specific-first sorting. Both backend (`ebayTemplateResolver.ts`) and client preview (`ebayPreviewResolver.ts`) are in sync.
- **Shopify sync (v2-shopify-send-graded):** Correctly handles PSA comics — builds title, description, metafields, tags, and sets inventory. The `isComic` detection (`main_category === 'comics'`) is correct for your test item.
- **Tag normalization trigger:** Populates `normalized_tags`, `primary_category` ("comics"), and `condition_type` ("graded") from Shopify tags.
- **Sync processor:** Fetches `normalized_tags` in its query, enforces 1-of-1 graded invariant via `cards` table status check, respects dry-run mode, and uses shared `resolveTemplate`.
- **Policy resolution chain:** Template > Routing Rule > Tag Mapping > Store Config — consistent across all paths.
- **Preview resolver:** Client-side mirrors backend logic including tag-match priority.

---

### Implementation Plan

1. **Fix `EBAY_COMIC_GRADER_IDS`** — Add PSA (and potentially other missing graders) to the comic grader map in `ebayConditions.ts`
2. **Fix `buildComicAspects` (backend)** — Use `item.psa_cert || item.cgc_cert` for Certification Number in `ebayConditions.ts`
3. **Fix `buildComicAspects` (client)** — Same fix in `ebayPreviewResolver.ts`
4. **Redeploy** `ebay-sync-processor` and `ebay-create-listing`

---

### Technical Detail: PSA Comic Grader ID

eBay's comic condition descriptor `40001` (Comic Grader) needs the correct value ID for PSA. The existing map uses IDs in the `4000xx` range. We need to confirm the exact PSA value — it may be `400021` based on the sequential pattern, or we may need to look it up from eBay's API.

