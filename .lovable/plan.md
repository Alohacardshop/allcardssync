

## Plan: Fix Invalid Category 259061 and Add Category Discovery/Validation

### Problem
Category ID `259061` ("Graded Comic Books") does not exist in eBay's live US category tree (error 62005). It's referenced in 4 places:
1. `ebay_categories` DB table (row with `id = '259061'`)
2. `ebay_listing_templates` — 4 graded comic templates use it
3. `supabase/functions/_shared/ebayConditions.ts` — `GRADED_COMIC_BOOKS: '259061'`
4. `src/lib/ebayPreviewResolver.ts` — hardcoded fallback

### Step 1: Harden schema fetcher against empty responses

**File: `supabase/functions/_shared/ebayCategorySchema.ts`**
- In `fetchConditions` (~line 176): replace `response.json()` with safe text-first parsing — read `response.text()`, return `[]` if empty, then `JSON.parse(text)`
- In `fetchAspects` (~line 199): same safe parsing pattern

### Step 2: Add `action: "subtree"` to the category schema edge function

**File: `supabase/functions/ebay-category-schema/index.ts`**
- Accept an optional `action` field in the request body (`"schema"` default, `"subtree"`)
- When `action === "subtree"`: call `GET /commerce/taxonomy/v1/category_tree/{treeId}/get_category_subtree?category_id={category_id}` and return the child categories with their IDs, names, leaf status, and children count
- This lets the admin browse eBay's live category tree from the Schema Inspector to discover the correct leaf ID for comics

### Step 3: Add subtree browser to Schema Inspector UI

**File: `src/components/admin/EbayCategorySchemaInspector.tsx`**
- Add a "Browse Subtree" button next to the existing "Inspect" button
- When clicked, calls the edge function with `action: "subtree"` for the entered category ID
- Displays child categories in a table with columns: ID, Name, Leaf?, Children count
- Clicking a leaf category auto-fills the inspector's category ID field

### Step 4: Remove invalid `259061` constant and update fallbacks

**File: `supabase/functions/_shared/ebayConditions.ts`**
- Change `GRADED_COMIC_BOOKS: '259061'` to `GRADED_COMIC_BOOKS: '63'` (temporary — will be updated to the real leaf once discovered)
- This constant is only a last-resort fallback; the template's `category_id` takes priority

**File: `src/lib/ebayPreviewResolver.ts`**
- Change the graded comics fallback from `{ id: '259061', name: 'Graded Comic Books' }` to `{ id: '63', name: 'Comic Books' }` (same temporary measure)

### Step 5: Update DB data (after discovery)

Once we deploy the subtree browser and use it to find the correct leaf category under `63`:
- Update `ebay_categories` row: change `id` from `259061` to the discovered leaf ID
- Update `ebay_listing_templates`: change `category_id` from `259061` to the discovered leaf ID on all 4 graded comic templates

This is a two-phase approach: deploy the tools first, discover the correct ID, then update the data.

### Files to modify
| File | Change |
|------|--------|
| `supabase/functions/_shared/ebayCategorySchema.ts` | Safe JSON parsing in `fetchConditions` and `fetchAspects` |
| `supabase/functions/ebay-category-schema/index.ts` | Add `action: "subtree"` mode |
| `src/components/admin/EbayCategorySchemaInspector.tsx` | Add subtree browser UI |
| `supabase/functions/_shared/ebayConditions.ts` | Replace `259061` with `63` temporarily |
| `src/lib/ebayPreviewResolver.ts` | Replace `259061` fallback with `63` |
| DB: `ebay_categories` + `ebay_listing_templates` | Update after leaf discovery |

