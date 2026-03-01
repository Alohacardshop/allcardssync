

## Make all PSA grade badges red for better visibility

Single change in `PSACertificateDisplay.tsx`: remove the conditional and always use `#dc2626` as the badge background color, regardless of grade value.

**File:** `src/components/PSACertificateDisplay.tsx`
- Change the `backgroundColor` from the conditional (`startsWith('10') ? '#dc2626' : gradeColor`) to just `'#dc2626'` for all grades.

