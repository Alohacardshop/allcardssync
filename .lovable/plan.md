

## Fix Tag Consistency: Comics vs Cards

### Problem

There are two separate tag-building paths — **graded** (`shopify-sync-core.ts`) and **raw** (`v2-shopify-send-raw`) — and they handle category tags inconsistently:

| Issue | Where |
|-------|-------|
| Raw sync builds tags from scratch, ignoring `normalized_tags` | `v2-shopify-send-raw` line 401-425 |
| Raw non-comic cards get `"Raw Card"` but no explicit `"card"` tag | `v2-shopify-send-raw` line 414 |
| Graded sync relies on `normalized_tags` for `"card"` — if missing, no `"card"` tag | `shopify-sync-core.ts` line 491 |
| Neither sync explicitly prevents `"card"` on comics or `"comics"` on cards | Both files |
| Raw card path defaults sub_category to `'pokemon'` even for sports | `v2-shopify-send-raw` line 419 |

### Plan

**1. Add explicit category tags in graded sync (`shopify-sync-core.ts` ~line 491)**

Add `!isComic ? 'card' : null` to the `tagsArray` builder alongside the existing `isComic ? 'comics'` entry. This ensures graded cards always get the `"card"` tag without relying solely on `normalized_tags`.

**2. Fix raw sync tag array (`v2-shopify-send-raw` ~line 401-425)**

- **Comic path**: Already has `'comics'` and `'raw'` — correct. Add a filter to ensure `'card'` never appears.
- **Non-comic path**: Replace `'Raw Card'` with `'card'` and `'raw'` as separate tags (consistent with DB trigger). Remove the fallback `intakeItem.main_category === 'comics' ? 'american' : 'pokemon'` — use just the `sub_category` or omit.
- **Both paths**: Merge `intakeItem.normalized_tags` into the tag array so DB-generated tags aren't lost.

**3. Add tag sanitization step in both sync functions**

After building the final `tagsArray`, strip contradictory tags:
- If `isComic`: remove `'card'`, `'Raw Card'`, `'single'`
- If not comic: remove `'comics'`

**4. Redeploy affected edge functions**

- `v2-shopify-send-raw`
- `process-shopify-sync-queue` (uses shopify-sync-core)
- `bulk-shopify-sync` (uses shopify-sync-core)

### Files to Change

- **Edit**: `supabase/functions/_shared/shopify-sync-core.ts` — add `'card'` tag for non-comics, add sanitization
- **Edit**: `supabase/functions/v2-shopify-send-raw/index.ts` — fix tag array, merge normalized_tags, add sanitization
- **Deploy**: 3 edge functions

