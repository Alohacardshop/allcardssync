

## Problem

When PSA graded comics are ingested, the PSA scraper returns a `subject` field with grade info baked in (e.g., "Amazing Spider-Man 1 PSA 10.0"). This polluted value flows into both the `subject` and `variant` DB columns. The grade also stores "10.0" instead of "10".

Current DB values for cert 146094215:
- `subject`: "Amazing Spider-Man 1 PSA 10.0" → should be "Amazing Spider-Man"
- `variant`: "1 PSA 10.0" → should be empty or just the variant description
- `grade`: "10.0" → should be "10"

## Changes

### 1. Clean PSA subject at normalization (`src/lib/psaNormalization.ts`)

In `normalizePSAData`, after extracting `subject`, strip trailing grade info patterns like `\d+ PSA \d+\.?\d*` from the subject string. This prevents "Amazing Spider-Man 1 PSA 10.0" from being stored — it becomes "Amazing Spider-Man".

### 2. Strip `.0` from grade at normalization (`src/lib/psaNormalization.ts`)

Apply `.replace(/\.0$/, '')` to the `grade` field so "10.0" becomes "10" right at the normalization layer.

### 3. Fix auto-populate in GradedCardIntake (`src/components/GradedCardIntake.tsx`)

When PSA data is for a comic (detected via `mainCategory === 'comics'`), auto-populate `variant` with the `varietyPedigree` field (which contains actual variant info like cover variants) instead of leaving it to be manually filled with grade-polluted data.

### 4. Fix existing data display in EditIntakeItemDialog

In `generateTitle` (line 48-67), the title already appends grade separately via `PSA ${item.grade}`. Since we're cleaning the subject, this will now produce clean titles like "2018 Marvel Comics Amazing Spider-Man #798 PSA 10".

## Summary

- **Root fix**: Clean grade info from `subject` in normalization layer
- **Grade format**: Strip `.0` at normalization 
- **Variant**: Auto-set from `varietyPedigree` for comics, not from polluted subject
- **No DB migration needed** — new items will be clean; existing items can be manually edited

