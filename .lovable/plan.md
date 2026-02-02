

## Graded Intake Improvements Plan

After reviewing the entire graded intake system (both cards and comics), I found several issues and opportunities for improvement.

---

### Issues Found

#### 1. Missing Title Validation in GradedComicIntake
The comic intake requires a title but doesn't validate it before submission. The validation at line 236 only checks for `certNumber`, `grade`, `price`, and `cost` - missing the `title` field which is marked as required in the UI.

#### 2. Barcode Auto-Fetch Not Working
In both `GradedCardIntake` and `GradedComicIntake`, the barcode scanner populates the cert input but doesn't automatically trigger the fetch. Users have to manually click "Fetch Data" after scanning.

#### 3. Placeholder Text Mismatch in GradedComicIntake
Line 338 shows "Enter CGC certificate number" even when PSA is selected. Should dynamically update based on the selected grading service.

#### 4. Year Field Missing in GradedComicIntake
The year is stored in `formData.year` but not sent to the database via `addItem()`. The form captures year data from fetched certificates but it's never persisted.

#### 5. Duplicate Success Toast in GradedComicIntake
The component doesn't show a success toast after adding an item because the `useAddIntakeItem` hook handles the toast - this is actually fine, but there's no visual feedback during the short moment between mutation completing and form resetting.

#### 6. isAdding State Not Used
In `GradedComicIntake`, `isAdding` from `useAddIntakeItem` hook is imported but not used - the component uses its own `submitting` state instead. This creates redundant state tracking.

---

### Proposed Improvements

#### 1. Fix Title Validation for Comics
Add `title` to the required field validation check.

#### 2. Auto-Fetch on Barcode Scan
After the barcode input populates the cert number, automatically trigger the fetch function.

#### 3. Dynamic Placeholder Text
Update the placeholder to show the correct grading service name based on current selection.

#### 4. Add Year to Database Payload
Include the year field in the `addItem()` call so it gets persisted with the intake item.

#### 5. Use Hook's Loading State
Replace the local `submitting` state with `isAdding` from the hook for consistency.

#### 6. Add Batch Count Display to GradedComicIntake
The `GradedCardIntake` shows current batch count but `GradedComicIntake` doesn't have this feature.

---

### Technical Implementation Details

**File: `src/components/GradedComicIntake.tsx`**

1. **Line 236** - Add title validation:
```typescript
// Change from:
if (!formData.certNumber || !formData.grade || !formData.price || !formData.cost) {
// Change to:
if (!formData.title || !formData.certNumber || !formData.grade || !formData.price || !formData.cost) {
```

2. **Line 58-64** - Add auto-fetch after barcode scan:
```typescript
useEffect(() => {
  if (debouncedBarcode && debouncedBarcode !== certInput) {
    const sanitized = sanitizeCertNumber(debouncedBarcode);
    setCertInput(sanitized);
    setFormData(prev => ({ ...prev, certNumber: sanitized }));
    setBarcodeInput("");
    // Trigger fetch after a short delay
    setTimeout(() => handleFetchData(), 100);
  }
}, [debouncedBarcode]);
```

3. **Line 338** - Fix dynamic placeholder:
```typescript
// Change from:
placeholder="Enter CGC certificate number (digits only)"
// Change to:
placeholder={`Enter ${gradingService.toUpperCase()} certificate number (digits only)`}
```

4. **Line 258-273** - Add year to payload:
```typescript
await addItem({
  // ... existing fields
  catalog_snapshot_in: {
    ...catalogSnapshot,
    year: formData.year  // Add year to snapshot
  }
});
```

5. **Remove `submitting` state** - Use `isAdding` from hook instead:
   - Remove line 34: `const [submitting, setSubmitting] = useState(false);`
   - Replace `submitting` with `isAdding` in button disabled state and loading indicator
   - Remove `setSubmitting(true)` and `setSubmitting(false)` calls

6. **Add batch count display** - Import `useCurrentBatch` and `useAuth` hooks, display badge similar to `GradedCardIntake`

---

### Files to Modify

| File | Changes |
|------|---------|
| `src/components/GradedComicIntake.tsx` | 6 fixes above |
| `src/components/GradedCardIntake.tsx` | Add auto-fetch on barcode scan |

