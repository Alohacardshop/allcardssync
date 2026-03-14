

## Fix: Graded Cards Getting Tagged as "Graded Comics"

### Problem
When a graded card is entered via the Graded Card Intake form, it can get incorrectly tagged as "graded comics" in the inventory. This happens because:

1. **`detectMainCategory()` is too aggressive with comics matching** — keywords like `"image"`, `"comic"` can false-positive on card data (e.g., a PSA category containing "image" or brand names).
2. **No "Sports" category option** exists in the Graded Card Intake form — only TCG and Comics. Sports cards from PSA have no correct home.
3. **The database tag trigger** uses `main_category` to decide whether to tag as `card` or `comics` — so a wrong `main_category` cascades into wrong tags.

### Fix Plan

**1. Add "Sports" to `detectMainCategory()` and the intake form** (`src/utils/categoryMapping.ts` + `src/components/GradedCardIntake.tsx`)
- Expand the return type to `'tcg' | 'comics' | 'sports'`
- Add sports keywords: baseball, basketball, football, hockey, soccer, etc.
- Add a "Sports" option to the Main Category dropdown in GradedCardIntake
- Check sports keywords **before** comics to prevent false matches

**2. Tighten comics matching** (`src/utils/categoryMapping.ts`)
- Remove overly generic keywords like `"image"` and `"comic"` (singular) from COMICS_GAMES — require more specific matches like `"image comics"`, `"comic book"`
- Ensure TCG/sports patterns are checked first, comics is a fallback only when explicitly matched

**3. Update the tag trigger to handle sports** (`supabase/migrations/`)
- Line 53: Change `IN ('tcg', 'sports')` — this already works, just needs `sports` as a valid `main_category` value flowing in
- No trigger change needed — it already handles `sports` correctly

**4. Fix PSA auto-detection to use the `category` field smarter** (`src/components/GradedCardIntake.tsx`)
- PSA returns a `category` field like `"Baseball Cards"`, `"Basketball Cards"`, `"Pokémon"` — use this to detect sports vs TCG vs comics before falling back to brand matching
- Add sports-specific detection: if category contains "baseball", "basketball", "football", etc. → set `main_category = 'sports'`

### Files to Change
- `src/utils/categoryMapping.ts` — Add sports keywords, tighten comics matching, expand return type
- `src/components/GradedCardIntake.tsx` — Add "Sports" option to category dropdown
- `src/components/PSABulkImport.tsx` — Same detection fix for bulk PSA imports
- No migration needed — the trigger already handles `sports` in the `card` tag logic

