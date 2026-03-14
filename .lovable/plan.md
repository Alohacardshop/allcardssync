

## Unified Title Generation: Separate Raw vs Graded Logic

### The Difference

Per existing conventions, **raw** and **graded** cards should generate titles differently:

| Aspect | Raw Cards | Graded Cards |
|--------|-----------|--------------|
| Variant field | Labeled "Condition" (e.g., "Near Mint - Foil") | Labeled "Variant" (e.g., "Holo") |
| Grading suffix | None — no grade/cert info | `{Company} {Grade}` (e.g., "PSA 10") |
| Variant filtering | Include as-is (it's the condition) | Skip "normal", "none", "n/a" |
| Cert number | N/A | Omit from title (keep in metadata) |

A card is "raw" if: `type === 'raw'` OR (no `grade` AND no `psa_cert` AND no `cgc_cert`).

### Plan

**1. Create `src/utils/generateTitle.ts`** — single shared utility with two internal paths:

```typescript
export function generateTitle(item): string {
  const isGraded = hasGradeOrCert(item);
  const parts = [];
  
  // Common: year, brand, subject, card_number
  if (year) parts.push(year);
  if (brand_title) parts.push(brand_title);
  if (subject) parts.push(subject);
  if (card_number) parts.push(`#${card_number}`);
  
  if (isGraded) {
    // Variant: skip "normal"/"none"/"n/a", include others
    if (variant && !SKIP_VARIANTS.has(variant.toLowerCase())) parts.push(variant);
    // Grade: "{Company} {Grade}"
    if (grade) parts.push(`${grading_company || 'PSA'} ${grade}`);
  } else {
    // Raw: variant = condition, include as-is
    if (variant) parts.push(variant);
  }
  
  // Deduplicate words (reuse existing dedup logic)
  return deduplicateParts(parts).join(' ') || 'Unknown Item';
}
```

**2. Replace all 5 frontend copies** to import from `src/utils/generateTitle.ts`:
- `InventoryItemCard.tsx` — remove inline function, import shared
- `InventoryTableView.tsx` — same (also fixes missing variant bug)
- `InspectorPanel.tsx` — same
- `ItemDetailsDrawer.tsx` — same
- `EditIntakeItemDialog.tsx` — same (adapt field mapping)

**3. Update `ebayTemplateResolver.ts` fallback** (line 292-303) — add variant to parts array with the same raw/graded split logic.

**4. No changes to `shopify-sync-core.ts`** — the backend Shopify title builder already handles variant and dedup correctly for graded cards, and raw cards go through a different send function.

### Files Changed
- **New**: `src/utils/generateTitle.ts`
- **Edit**: 5 frontend files (swap inline function for import)
- **Edit**: `supabase/functions/_shared/ebayTemplateResolver.ts` (add variant + raw/graded logic to fallback)

