

# Complete Fix: Variety Information Display for Graded Comic Items

## Problem Summary
The variety information (e.g., "1 1:25 Matteo Scalera Variant Cover") is stored correctly in `catalog_snapshot.varietyPedigree` but is not displayed properly in the batch panel because:

1. The existing item in the database has `subject: "Absolute Superman"` and `variant: "PSA 9.6"` without the variety info
2. The display logic in `formatCardName()` uses `item.subject` directly without incorporating variety from `catalog_snapshot`
3. The duplicate update logic (now fixed) wasn't updating descriptive fields

## Solution Overview
This requires fixes in **3 areas**:

1. **Display Logic** - Update `formatCardName()` to include variety from `catalog_snapshot.varietyPedigree`
2. **Duplicate Handling** - Already fixed in previous change to `useAddIntakeItem.ts`
3. **New Item Creation** - Already correct in `GradedComicIntake.tsx` (builds `titleWithVariant` properly)

---

## Technical Details

### File 1: `src/components/CurrentBatchPanel.tsx`
**Change**: Update `formatCardName()` function to incorporate variety information from `catalog_snapshot.varietyPedigree` when displaying comic items.

**Current logic (lines 62-89):**
```typescript
const formatCardName = (item: IntakeItem) => {
  const parts = []
  // ... adds year, brand, subject, card_number, grade
  if (item.subject) parts.push(item.subject)
  // ... adds grading info
  return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
}
```

**New logic:**
```typescript
const formatCardName = (item: IntakeItem) => {
  const parts = []
  
  // Get year
  const year = item.year || (item.catalog_snapshot?.year);
  if (year) parts.push(year)
  
  // Add brand/set
  if (item.brand_title) parts.push(item.brand_title)
  
  // Add subject (like card name)
  if (item.subject) parts.push(item.subject)
  
  // Add variety from catalog_snapshot if not already in subject
  const variety = item.catalog_snapshot?.varietyPedigree;
  if (variety && item.subject && !item.subject.includes(variety)) {
    parts.push(variety)
  }
  
  // Add card number
  if (item.card_number) parts.push(`#${item.card_number}`)
  
  // Handle grading - use PSA for PSA certs
  if (item.grade && item.psa_cert) {
    parts.push(`PSA ${item.grade}`)
  } else if (item.grade) {
    parts.push(`Grade ${item.grade}`)
  } else if (item.psa_cert) {
    parts.push(`PSA ${item.psa_cert}`)
  }
  
  return parts.length > 0 ? parts.join(' ') : (item.sku || 'Unknown Item')
}
```

This ensures:
- Existing items (with variety in `catalog_snapshot` but not in `subject`) display correctly
- New items (where `subject` already includes variety) don't duplicate the variety text
- The display remains correct for all item types (cards, comics, graded/raw)

---

### File 2: `src/hooks/useAddIntakeItem.ts`
**Status**: Already fixed in previous change - duplicate handling now updates `subject`, `variant`, `catalog_snapshot`, `brand_title`, `year`, and `grade` fields.

---

### File 3: `src/components/GradedComicIntake.tsx`
**Status**: Already correct - lines 265-278 build `titleWithVariant` by concatenating title + variety + grade info.

---

## Data Migration (Optional)
For the existing Superman item (id: `3fcb62ff-3425-4f36-89b5-0f18b3b90759`), the user can either:

1. **Re-add the item** (scan the certificate again) - the duplicate logic will now update the title with variety
2. **Edit manually** via the Edit dialog in the batch panel
3. **Run a one-time SQL update** (for admin users):
```sql
UPDATE intake_items 
SET subject = 'Absolute Superman 1 1:25 Matteo Scalera Variant Cover PSA 9.6',
    variant = '1 1:25 Matteo Scalera Variant Cover PSA 9.6'
WHERE id = '3fcb62ff-3425-4f36-89b5-0f18b3b90759';
```

---

## Testing Checklist
After implementation:
1. Check that existing Superman item displays with variety in batch panel
2. Add a new PSA comic with variety - verify title includes variety
3. Re-scan the same certificate - verify quantity updates AND title/variant are preserved
4. Verify TCG cards still display correctly (no regression)
5. Verify raw comics without variety info still work

