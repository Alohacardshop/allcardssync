# Frontend Diagnostics Enhancement

**Date**: 2025-10-29  
**Author**: Dorian Takahashi  
**Component**: Error Handling for Batch Operations

## Overview

Enhanced error handling in `useBatchSendToShopify` hook and `CurrentBatchPanel` component to provide better diagnostics and recovery instructions when PostgreSQL cache errors occur.

## Changes Made

### 1. Enhanced Error Detection

**Files Modified**:
- `src/hooks/useBatchSendToShopify.ts`
- `src/components/CurrentBatchPanel.tsx`

**Improvements**:
- Detects "record 'new'" and "record 'old'" PostgreSQL cache errors specifically
- Shows first 100 characters of PostgREST error messages in toast notifications
- Provides actionable remediation instructions for different error types

### 2. Automatic Retry with 2-Second Backoff

**Before**: Used exponential backoff starting at 500ms  
**After**: Uses fixed 2-second backoff for cache errors as specified

```typescript
// If it's a cache error and we have retries left, wait 2 seconds and retry
if (isCacheError && attempt < maxAttempts) {
  logger.warn(`Database cache error detected, retrying with 2s backoff...`)
  await delay(2000) // 2-second backoff
  continue
}
```

### 3. Specific "Record New" Error Handling

When the system detects a "record 'new' has no field" error, it now:

1. **Truncates error to 100 chars** for display
2. **Provides step-by-step fix instructions**:
   ```
   🔧 Database Cache Error - Run these SQL files in Supabase SQL Editor:
   1. db/fixes/recompile_intake_items_triggers.sql
   2. db/fixes/recreate_send_intake_items_to_inventory.sql
   3. db/fixes/discard_all.sql
   4. db/fixes/ensure_updated_by_trigger.sql
   Or run: ./scripts/db-fix-intake-items.sh
   ```
3. **Extends toast duration to 15 seconds** (vs. 5 seconds for normal errors)
4. **Logs detailed error info** for debugging

### 4. Error Classification

The system now classifies errors into three categories:

#### Category 1: "Record New" Cache Errors
- Patterns: `record "new"`, `record "old"`, `has no field`
- **Action**: Show DB fix script instructions
- **Duration**: 15 seconds
- **Retry**: Automatic with 2s backoff

#### Category 2: Schema/Column Errors
- Patterns: `column`, `does not exist`
- **Action**: Suggest refresh or DB fix scripts
- **Duration**: 8 seconds
- **Retry**: Automatic with 2s backoff

#### Category 3: Other Errors
- All other error types
- **Action**: Display error message with code
- **Duration**: 5 seconds
- **Retry**: No automatic retry

## Code Example

### Before (Generic Error Handling)
```typescript
if (error) {
  toast.error('Database error occurred')
}
```

### After (Enhanced Error Handling)
```typescript
const errorMessage = error.message || ''
const errorPreview = errorMessage.substring(0, 100)
const isRecordNewError = errorMessage.includes('record "new"')

if (isRecordNewError) {
  const fixInstructions = [
    'Database cache error. Run these SQL files:',
    '1. db/fixes/recompile_intake_items_triggers.sql',
    '2. db/fixes/recreate_send_intake_items_to_inventory.sql',
    '3. db/fixes/discard_all.sql',
    '4. db/fixes/ensure_updated_by_trigger.sql'
  ].join('\n')
  
  toast.error('Database Cache Error - "record new" Field Missing', {
    description: `${errorPreview}...\n\n${fixInstructions}`,
    duration: 15000
  })
}
```

## Testing

### Test Scenario 1: Cache Error with Retry
1. Add `updated_by` column to `intake_items`
2. Don't run fix scripts (intentionally leave cache stale)
3. Try to send batch to inventory
4. **Expected**: 
   - First attempt fails with "record 'new'" error
   - System waits 2 seconds
   - Retry automatically
   - If still fails, shows fix instructions

### Test Scenario 2: Error Message Display
1. Trigger any database error
2. **Expected**: Toast shows first 100 chars with "..." if truncated
3. Full error logged to console for debugging

### Test Scenario 3: Fix Instructions
1. Trigger "record 'new'" error
2. **Expected**: Toast displays:
   - Error preview (100 chars)
   - Numbered list of SQL files to run
   - Alternative shell script command
   - 15-second display duration

## Related Files

### Documentation
- `scripts/README.md` - Updated with troubleshooting section
- `db/FRONTEND_DIAGNOSTICS_ENHANCEMENT.md` - This file

### SQL Fix Files
- `db/fixes/recompile_intake_items_triggers.sql`
- `db/fixes/recreate_send_intake_items_to_inventory.sql`
- `db/fixes/discard_all.sql`
- `db/fixes/ensure_updated_by_trigger.sql`

### Shell Scripts
- `scripts/db-fix-intake-items.sh` - Master fix script
- `scripts/db-test-updated-by.sh` - Verification test

## Benefits

1. **User Empowerment**: Users get clear, actionable instructions instead of cryptic errors
2. **Self-Service**: Users can fix cache errors without contacting support
3. **Better Debugging**: First 100 chars of error + full error in console
4. **Automatic Recovery**: 2-second retry handles transient cache issues
5. **Context-Aware**: Different remediation for different error types

## Future Enhancements

1. Add link buttons to toast notifications for one-click access to SQL Editor
2. Implement automatic cache clearing from frontend (if Supabase API supports)
3. Add telemetry to track cache error frequency
4. Create dashboard widget showing cache health
5. Implement progressive backoff (2s, 4s, 8s) for persistent errors

## References

- Related Issue: "record 'new' has no field 'updated_by'"
- PostgreSQL Docs: [Prepared Statements](https://www.postgresql.org/docs/current/sql-prepare.html)
- PostgREST Docs: [Connection Pooling](https://postgrest.org/en/stable/admin.html#connection-pool)
- Supabase Docs: [Cache Notes](../docs/supabase-cache-notes.md)
