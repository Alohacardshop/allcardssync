

## Problem

The Edit Item Details dialog currently shows fields that don't match PSA's official layout. From the screenshots:

- **Subject** shows "Amazing Spider-Man 1 PSA 10.0" (polluted with grade info)
- **Variant** shows "1 PSA 10.0" (should just be "1")
- **Grade** shows "10.0" (should be "10")
- No front/back image preview
- Field order doesn't match PSA's Item Information layout

## Changes

### File: `src/components/EditIntakeItemDialog.tsx`

1. **Add front/back image preview at the top** — Show thumbnail images from `imageUrl` (and a second image URL field for back image). Display side-by-side like PSA certificate display.

2. **Restructure fields to match PSA layout order:**
   - Images (front & back) at top
   - Cert Number / Grading Company
   - Item Grade (with `.0` strip applied on display)
   - Name (Subject — cleaned)
   - Volume Number / Card Number
   - Year / Publication Date
   - Publisher / Brand
   - Variant (clean, just variety/pedigree)
   - Category fields
   - Separator
   - Price / Cost / Quantity / SKU

3. **Clean displayed values on load** — When the dialog opens, apply `formatGrade` to strip `.0` from grade, and strip trailing grade patterns from subject/variant using the same regex from `psaNormalization.ts`.

4. **Support multiple image URLs** — Change `imageUrl` from single string to support front/back. Update the `IntakeItemDetails` type to include `imageUrls?: string[]` alongside `imageUrl`. Show two input fields: "Front Image URL" and "Back Image URL".

### File: `src/components/CurrentBatchPanel.tsx`

5. **Pass all image URLs** — Update the data mapping (lines 698-702) to pass the full `image_urls` array so front and back images are available in the dialog.

6. **Save multiple image URLs** — Update the save handler (line 731) to persist both front and back image URLs to the `image_urls` array column.

### Technical Detail

The `image_urls` column in `intake_items` is already a text array (`text[]`), so it natively supports front/back images. The dialog will split this into two fields. On save, both URLs are combined back into the array. The grade/subject cleaning uses the same regex patterns already in `psaNormalization.ts`: `subject.replace(/\s+\d*\s*PSA\s+\d+\.?\d*$/i, '')` and `grade.replace(/\.0$/, '')`.

