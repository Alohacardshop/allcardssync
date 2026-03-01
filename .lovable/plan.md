

## Fix: Grade 10 red badge not triggering

The grade value coming from PSA for comics is `"10.0"` but the code checks for exact match `=== '10'`. Need to update the condition to handle both formats.

**Change in `PSACertificateDisplay.tsx`:**
- Update the backgroundColor condition from `psaData.grade === '10'` to `psaData.grade?.startsWith('10')` to catch `"10"`, `"10.0"`, etc.

One-line fix.

