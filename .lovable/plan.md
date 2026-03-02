

## Problem

The `useAddIntakeItem` hook has duplicate SKU detection that **increments quantity** when the same cert number is scanned again. For graded items (unique cert numbers), this is incorrect — scanning the same cert should either be rejected or just refresh the data, never increment quantity.

The quantity shows 3 because the same cert was added 3 times, and each time the duplicate logic ran: `newQuantity = (existing.quantity || 0) + (params.quantity_in || 1)`.

## Fix

In `src/hooks/useAddIntakeItem.ts`, modify the duplicate handling logic:

**When a graded item (has `grading_company_in`) is detected as a duplicate:**
- Do NOT increment quantity
- Instead, show a warning toast: "This cert number already exists in the batch"
- Return early without modifying the record

This keeps the existing duplicate-merge behavior for non-graded items (raw comics, bulk cards) while enforcing the 1-of-1 rule for graded items.

**Specifically:** Add a check right after `if (existing)` (around line 77) and in the fallback duplicate block (~line 170):

```ts
if (existing) {
  // Graded items are 1-of-1 — never allow quantity increment
  if (params.grading_company_in) {
    toast.warning(`Cert ${params.sku_in} already exists in the batch.`);
    return { id: existing.id, sku: existing.sku } as AddIntakeItemResponse;
  }
  // ... rest of existing duplicate-merge logic
}
```

Also fix any existing records: run an update query to reset quantity to 1 for all graded items currently showing quantity > 1.

