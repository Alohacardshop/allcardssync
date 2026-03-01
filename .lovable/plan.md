

# PSA Comic Cert Lookup: End-to-End Fix

## 1. Database Migration -- Add 6 missing columns to `psa_certificates`

```sql
ALTER TABLE public.psa_certificates
  ADD COLUMN IF NOT EXISTS publication_date TEXT,
  ADD COLUMN IF NOT EXISTS page_quality TEXT,
  ADD COLUMN IF NOT EXISTS language TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS grade_label TEXT,
  ADD COLUMN IF NOT EXISTS grader_notes TEXT;
```

All nullable TEXT. No data loss, no constraints.

## 2. Backend: Update `cacheCertificateData()` in `supabase/functions/psa-lookup/helpers.ts`

Add 6 fields to the `psa_certificates` upsert (lines 122-138):

```ts
publication_date: responseData.publicationDate,
page_quality: responseData.pageQuality,
language: responseData.language,
country: responseData.country,
grade_label: responseData.gradeLabel,
grader_notes: responseData.graderNotes,
```

`normalizePsaCertData()` already maps these columns back -- no changes needed there.

## 3. Frontend: Update `PSACertificateDisplay` component

**Comic detection**: `const isComic = psaData.category?.toUpperCase().includes('COMIC') ?? false;`

**Image section** -- replace single image with dual-image layout:
- If `psaData.imageUrls?.length >= 2`: render two images side-by-side (`grid grid-cols-2 gap-2` on md+, stacked on mobile)
- If 1 image or only `imageUrl`: single image (current behavior)
- Track error state per image index

**Label changes** (conditional on `isComic`):
- `brandTitle` label: "Publisher" for comics, "Brand" for cards
- `cardNumber` label: "Volume #" for comics, "Card #" for cards

**New fields rendered** (when present):
- `gradeLabel` -- shown in the grade badge area as subtitle (e.g., "GEM MT 10.0")
- `publicationDate` -- with Calendar icon, label "Published"
- `pageQuality` -- label "Pages"
- `language` -- label "Language"
- `country` -- label "Country"
- `graderNotes` -- full-width text block below the grid

## 4. No changes to types

`src/types/psa.ts` already has all fields defined (`gradeLabel`, `publicationDate`, `pageQuality`, `language`, `country`, `graderNotes`).

## 5. No changes to intake tabs

Already correctly labeled for comics.

## Files Changed

| File | Change |
|------|--------|
| Migration SQL | Add 6 columns |
| `supabase/functions/psa-lookup/helpers.ts` | 6 fields added to `cacheCertificateData` upsert |
| `src/components/PSACertificateDisplay.tsx` | Dual images, comic-aware labels, new field rendering |

