

## Problem

The PSA Certificate Display component currently shows grade as just a number (e.g., "Grade 10") and the `gradeLabel` as a subtitle. The user wants it to match PSA's exact format from their screenshot — showing the full grade label like "GEM MT 10" (with `.0` stripped) as the primary display.

## Changes

**File: `src/components/PSACertificateDisplay.tsx`**

1. **Grade Badge (lines 61-76):** Change from `Grade {psaData.grade}` to show `gradeLabel` as the primary text (with `.0` stripped), falling back to `Grade {grade}` if no label exists. Remove the separate `gradeLabel` subtitle since it's now the primary display.

2. **Detail fields layout (lines 120-228):** Reorder to match PSA's exact format from the screenshot:
   - Cert Number (already shown above)
   - Item Grade (already the badge)
   - Name (subject)
   - Volume Number / Card # 
   - Publication Date
   - Publisher / Brand
   - Variant
   - Language
   - Country
   - Page Quality
   - Category

3. **Apply `formatGrade` to strip `.0`** from the `gradeLabel` display (e.g., "GEM MT 10.0" → "GEM MT 10").

### Technical Detail

The `gradeLabel` field comes from PSA's `CardGrade` (API) or `Item Grade` (scraper) and contains the full text like "GEM MT 10.0". The `grade` field is just the numeric part ("10"). We'll use `formatGrade` from `src/lib/labelData.ts` to clean the `.0` from the label, and display it as the primary grade text in the badge.

