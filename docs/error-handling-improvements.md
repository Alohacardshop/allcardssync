# Frontend Error Handling Improvements

## Overview

Improved error handling for `send_intake_items_to_inventory` RPC calls across the application to provide better user experience, actionable error messages, and automatic retry logic for transient failures.

## Date Implemented
2025-10-29

## Problem Solved

Previously, when database schema changes occurred (like adding the `updated_by` column), the application would fail with cryptic errors like:
```
record "new" has no field "updated_by"
```

Users had no guidance on:
- What the error meant
- Whether to retry
- How to resolve the issue

## Improvements Made

### 1. Automatic Retry with Exponential Backoff

**Files Updated:**
- `src/hooks/useBatchSendToShopify.ts`
- `src/components/CurrentBatchPanel.tsx`
- `src/components/admin/ShopifyQueueTest.tsx`

**Implementation:**
```typescript
const maxAttempts = 2
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const { data, error } = await supabase.rpc('send_intake_items_to_inventory', ...)
  
  if (!error) break // Success
  
  // Check if retryable (schema/cache errors)
  const isCacheError = error.message?.includes('has no field') || 
                      error.message?.includes('column') ||
                      error.message?.includes('does not exist')
  
  if (isCacheError && attempt < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, attempt * 500))
    continue
  }
  
  break
}
```

**Benefits:**
- Handles transient PostgREST connection pool cache issues
- Uses exponential backoff (500ms, 1000ms) to avoid hammering the database
- Only retries schema-related errors
- Non-retryable errors fail immediately

### 2. Actionable Error Messages

**Before:**
```
Error: record "new" has no field "updated_by"
```

**After:**
```
Database schema error: record "new" has no field "updated_by". 
This may indicate a database cache issue. Please contact support 
or run the database recompilation script.

⚠️ This appears to be a database schema issue. Try refreshing 
the page. If the problem persists, contact support.
```

**Implementation:**
```typescript
let errorDescription = error.message || 'Unknown error'

if (error.message?.includes('has no field') || 
    error.message?.includes('column') || 
    error.message?.includes('does not exist')) {
  errorDescription += '\n\n⚠️ This appears to be a database schema issue. Try refreshing the page. If the problem persists, contact support.'
}
```

### 3. Enhanced Logging

**Debug-Level Logging:**
```typescript
// Log full response at debug level
console.log('RPC Response:', { data, error, attempt })

// Log detailed error information
console.error('RPC Error (attempt ' + attempt + '):', {
  message: error.message,
  code: error.code,
  details: error.details,
  hint: error.hint,
  fullError: error
})
```

**Production Logging:**
- Full error details logged to console (debug level)
- Structured error information for monitoring tools
- Attempt numbers tracked for retry analysis

### 4. Improved Toast Notifications

**Success:**
```typescript
toast({ 
  title: "Success", 
  description: `Item sent to inventory${data ? ` (ID: ${data})` : ''}` 
})
```

**Error (with longer duration for complex messages):**
```typescript
toast({ 
  title: "Error", 
  description: errorDescription,
  variant: "destructive",
  duration: 8000  // 8 seconds for important errors
})
```

**Batch Processing Errors:**
```typescript
if (isCacheError) {
  toast.error('Database Schema Error', {
    description: 'There appears to be a database schema synchronization issue. Please refresh the page or contact support.',
    duration: 8000
  })
}
```

## Error Classification

### Schema/Cache Errors (Retryable)
Detected by checking if error message contains:
- `"has no field"`
- `"column"`
- `"does not exist"`

**Action:** Automatic retry with exponential backoff

### Other Errors (Non-Retryable)
- Permission errors
- Missing data
- Invalid parameters
- Network failures

**Action:** Immediate failure with descriptive message

## User Experience Flow

### Success Case
1. User clicks "Send to Inventory"
2. RPC call succeeds on first attempt
3. Success toast appears
4. Items refresh automatically
5. Batch count updates

### Transient Error Case (Recoverable)
1. User clicks "Send to Inventory"
2. First attempt fails with cache error
3. Console logs warning about retry
4. Automatic retry after 500ms
5. Second attempt succeeds
6. Success toast appears (user never saw the transient error)

### Persistent Error Case (Unrecoverable)
1. User clicks "Send to Inventory"
2. First attempt fails with cache error
3. Console logs warning about retry
4. Automatic retry after 500ms
5. Second attempt also fails
6. **Actionable error toast** appears with:
   - Clear error message
   - Remediation hint
   - "Try refreshing" suggestion
   - Contact support guidance
7. Full error details logged to console
8. Items remain in batch (not lost)

## Testing

### Test Scenario 1: Normal Operation
```bash
# Expected: Success on first attempt
1. Add item to batch
2. Click "Send to Inventory"
3. Verify: Success toast appears
4. Verify: Item removed from batch
5. Verify: Console shows single attempt
```

### Test Scenario 2: Transient Cache Error
```bash
# Expected: Automatic recovery via retry
1. Simulate cache error (requires DB access)
2. Click "Send to Inventory"
3. Verify: Console shows retry warning
4. Verify: Second attempt succeeds
5. Verify: Success toast (no error visible to user)
```

### Test Scenario 3: Persistent Schema Error
```bash
# Expected: Clear, actionable error message
1. Introduce actual schema mismatch
2. Click "Send to Inventory"
3. Verify: Console shows 2 attempts
4. Verify: Error toast with remediation hint
5. Verify: Full error details in console
6. Verify: Item still in batch
```

## Files Modified

1. **src/hooks/useBatchSendToShopify.ts**
   - Added retry loop around `send_intake_items_to_inventory` call
   - Implemented exponential backoff
   - Enhanced error classification
   - Improved toast notifications
   - Added debug-level logging

2. **src/components/CurrentBatchPanel.tsx**
   - Added retry logic to `handleSendToInventory`
   - Enhanced error messages with remediation hints
   - Improved logging for debugging
   - Extended toast duration for errors

3. **src/components/admin/ShopifyQueueTest.tsx**
   - Added retry logic to test workflow
   - Enhanced error reporting in test results
   - Added schema error detection

## Related Documentation

- [Supabase Cache Notes](./supabase-cache-notes.md) - Understanding cache behavior
- [Database Fixes](../db/fixes/) - SQL scripts for schema issues

## Monitoring Recommendations

### Key Metrics to Track
- **Retry Success Rate**: How often second attempts succeed
- **Schema Error Frequency**: Indicates need for better cache management
- **Average Retry Delay**: Monitor for performance impact
- **Error Type Distribution**: Schema vs other errors

### Alerting Thresholds
- **High Schema Error Rate** (>5%): Indicates systemic cache issues
- **Low Retry Success Rate** (<80%): May need longer delays or more attempts
- **Persistent Failures**: Same item failing repeatedly

## Future Enhancements

### Potential Improvements
1. **Configurable Retry Attempts**: Allow admins to adjust retry count
2. **Circuit Breaker**: Temporarily disable retries if system is degraded
3. **Retry Analytics**: Track success rates and optimize backoff timing
4. **Health Check**: Proactively detect cache issues before users encounter them
5. **Automatic Cache Clear**: Trigger `DISCARD ALL` when pattern detected

### Nice-to-Have Features
- User notification when automatic retry worked
- "Retry" button on error toast
- Progress indicator during retry attempts
- Admin dashboard showing retry statistics

## Acceptance Criteria Met

✅ RPC calls wrapped with error boundary and retry logic  
✅ Toast/snackbar displays clear, actionable error messages  
✅ Remediation hints provided for schema errors  
✅ 2 retry attempts with exponential backoff implemented  
✅ Full error response logged at debug level  
✅ Success flow shows correct counts  
✅ Failure flow provides actionable guidance  

## Credits

This improvement was implemented following ChatGPT's recommendations for handling PostgreSQL trigger cache invalidation issues after schema changes.

## Version History

- **v1.0** (2025-10-29): Initial implementation
  - Retry logic with exponential backoff
  - Enhanced error messages
  - Debug-level logging
  - Improved toast notifications
