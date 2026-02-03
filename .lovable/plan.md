

# Graded Comic Flow Verification - Summary & Fixes Needed

## Verification Complete

After a thorough review of all graded comic components, I identified the current state and remaining issues.

---

## What's Working Correctly

| Component | Status | Notes |
|-----------|--------|-------|
| `GradedComicIntake.tsx` | Working | Correctly builds title with variety (e.g., "Absolute Superman 1 1:25 Matteo Scalera Variant Cover PSA 9.6") |
| `useAddIntakeItem.ts` | Fixed | Duplicate handling now updates `subject`, `variant`, `catalog_snapshot`, `brand_title`, `year`, `grade` |
| `PSACertificateDisplay.tsx` | Working | Shows variety under "Variety:" label |
| `CGCCertificateDisplay.tsx` | Working | Shows variety when present |
| `CurrentBatchPanel.tsx` | Partially working | Has fallback for `varietyPedigree` but missing CGC `variety` fallback |

---

## Issues Requiring Fixes

### Issue 1: Display Logic Missing CGC Variety Fallback

**File:** `src/components/CurrentBatchPanel.tsx`

**Current code (line 77):**
```typescript
const variety = item.catalog_snapshot && typeof item.catalog_snapshot === 'object' 
  && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot 
  ? item.catalog_snapshot.varietyPedigree : null;
```

**Problem:** Only checks for `varietyPedigree` (PSA field), not `variety` (CGC field).

**Fix:** Check both fields:
```typescript
const snapshot = item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null ? item.catalog_snapshot : null;
const variety = snapshot ? (snapshot.varietyPedigree || snapshot.variety) : null;
```

---

### Issue 2: GradedCardIntake Not Including Variety in Subject

**File:** `src/components/GradedCardIntake.tsx` (for trading cards, not comics)

**Current code (lines 414-417):**
```typescript
brand_title_in: formData.brandTitle,
subject_in: formData.subject,  // Raw subject without variety
```

**Problem:** Unlike `GradedComicIntake.tsx`, the graded CARD intake does not build a combined title with variety info. Trading cards with variety/pedigree info (e.g., "PSA 10 Pop 1") won't show that in the title.

**Recommendation:** Add similar logic to build `subject_in` with variety appended (optional - depends if this is desired for cards).

---

### Issue 3: Existing Data Not Updated

**Current item in database (sku: 125580263):**
- `subject`: "Absolute Superman" (missing variety)
- `variant`: "PSA 9.6" (missing variety)  
- `catalog_snapshot.varietyPedigree`: "1 1:25 Matteo Scalera Variant Cover" (correct)

**Options to fix existing data:**

1. **Re-scan the certificate** - The duplicate logic will now update the title with variety
2. **Manual edit** via the Edit dialog in the batch panel
3. **SQL update** (one-time fix):
```sql
UPDATE intake_items 
SET 
  subject = 'Absolute Superman 1 1:25 Matteo Scalera Variant Cover PSA 9.6',
  variant = '1 1:25 Matteo Scalera Variant Cover PSA 9.6'
WHERE sku = '125580263';
```

---

## Changes to Implement

### Change 1: Fix CurrentBatchPanel display fallback

Update `src/components/CurrentBatchPanel.tsx` line 77 to check both PSA (`varietyPedigree`) and CGC (`variety`) fields:

```typescript
// Current (only PSA):
const variety = item.catalog_snapshot && typeof item.catalog_snapshot === 'object' 
  && item.catalog_snapshot !== null && 'varietyPedigree' in item.catalog_snapshot 
  ? item.catalog_snapshot.varietyPedigree : null;

// Fixed (both PSA and CGC):
const snapshot = item.catalog_snapshot && typeof item.catalog_snapshot === 'object' && item.catalog_snapshot !== null ? item.catalog_snapshot : null;
const variety = snapshot 
  ? (('varietyPedigree' in snapshot ? snapshot.varietyPedigree : null) || ('variety' in snapshot ? snapshot.variety : null))
  : null;
```

---

## Testing After Changes

1. **Check existing Superman item** - Should display "DC Comics Absolute Superman 1 1:25 Matteo Scalera Variant Cover PSA 9.6" in batch panel (due to fallback)
2. **Add new PSA comic with variety** - Verify title includes variety
3. **Re-scan same certificate** - Verify quantity updates AND title/variant are preserved with variety
4. **Add CGC comic** - Verify CGC variety displays correctly (if present)
5. **Verify trading cards** - Ensure no regression for graded cards

