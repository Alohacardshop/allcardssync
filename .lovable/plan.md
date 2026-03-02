

## Issues Found in Current Batch Panel

Looking at the screenshot, there are **3 distinct problems** in `src/components/CurrentBatchPanel.tsx`:

### 1. Title shows "10.0" and duplicates "PSA 10"
**Title:** `2018 Marvel Comics Amazing Spider-Man 1 PSA 10.0 #798 PSA 10`

The PSA snapshot title (e.g., from `psaSnapshot.cardName`) likely already contains "PSA 10.0" in it. Then line 73 appends another `PSA ${formatGrade(item.grade)}` → "PSA 10". This causes duplication.

**Fix (lines 67-112):** In `formatCardName`, when using the PSA snapshot title, check if the title already contains grade info before appending it. Also ensure `formatGrade` is applied everywhere (the snapshot title itself has "10.0" baked in — strip trailing `.0` from the snapshot title too).

### 2. Condition line shows "1 PSA 10.0" for graded items
**Line 490-495:** The condition section is meant for raw cards (comment says "Show condition for raw cards only") but it still renders for graded items. For a graded comic, `getCondition()` returns the variant field which contains something like "1 PSA 10.0".

**Fix:** Skip the condition line entirely when the item has a grade + cert (PSA or CGC). Graded condition is already shown in the title. If we do show it, format it as "PSA 10" using `formatGrade`.

### 3. Sub-category badge shows raw "graded_comics"
The `sub_category` badge renders the raw DB value `graded_comics` instead of a human-friendly label.

**Fix (lines 505-509):** Format the sub_category for display — e.g., `graded_comics` → `Graded`, or hide it entirely since the grade is already visible in the title. A simple mapping or `.replace(/_/g, ' ')` with title-casing would work.

---

### Summary of Changes

**File:** `src/components/CurrentBatchPanel.tsx`

1. **`formatCardName` function** — When using PSA snapshot title, strip trailing `.0` from the title string itself (regex replace `(\d+)\.0\b` → `$1`), and don't append grade if the title already contains grade info (check for "PSA" in the title).

2. **Condition display (line ~491)** — Add a guard: only show condition for items that do NOT have `item.grade` with `item.psa_cert` or `item.cgc_cert`. Graded items already show grade in the title.

3. **Sub-category badge (line ~506)** — Format `graded_comics` → `Graded` (or a simple humanize function). Could also just hide sub_category when it's redundant with the grade shown in the title.

