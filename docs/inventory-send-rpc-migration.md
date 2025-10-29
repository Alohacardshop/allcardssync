# Inventory Send RPC Migration

## Problem
The `send_intake_items_to_inventory` RPC was returning:
```json
{ "processed": 1, "failed": 0, "failed_items": [] }
```

But frontend expected:
```json
{ "processed": 1, "processed_ids": ["uuid"], "rejected": [] }
```

This caused items to be marked as sent in the DB but not queued for Shopify sync, leading to items staying visible in the UI even after being sent to inventory.

## Solution
Updated RPC to return `processed_ids` array and renamed `failed_items` to `rejected` for consistency with frontend expectations.

## Response Schema
```typescript
{
  processed: number;        // Count of successful updates
  processed_ids: string[];  // Array of successfully processed item UUIDs
  rejected: Array<{         // Array of rejected items with reasons
    id: string;
    reason: string;
  }>;
}
```

## Changes Made

### Database
- **File**: `db/fixes/recreate_send_intake_items_to_inventory.sql`
- Updated function to collect `processed_ids` array during iteration
- Changed `failed_items` to `rejected` with proper `{ id, reason }` structure
- Returns `COALESCE(array_length(processed_ids, 1), 0)` for safe count

### Frontend
- **File**: `src/hooks/useBatchSendToShopify.ts`
- Added proper TypeScript typing for RPC response
- Extracted `processedIds` and `rejected` with safe defaults
- Added logging for processed vs rejected counts
- Added user-facing toast warnings for rejected items
- Updated all references to use `processedIds` variable instead of `inventoryResult.processed_ids`

## Testing Checklist
1. ✅ Add item to batch
2. ✅ Click "Send to Inventory"
3. ✅ Verify console shows: `Inventory send result: X processed, Y rejected`
4. ✅ Verify item disappears from batch panel immediately
5. ✅ Verify Shopify sync queue contains the processed items
6. ✅ Check DB: `removed_from_batch_at` should be set for processed items
7. ✅ Test rejection case: Try to send already-processed item (should show in `rejected`)

## Deployment Steps
1. Run updated SQL in Supabase SQL Editor to recreate the function
2. Deploy frontend changes (automatic)
3. Test with real batch items
4. Monitor logs for `processed_ids` array in responses

## Related Files
- `db/fixes/recreate_send_intake_items_to_inventory.sql` - RPC function definition
- `src/hooks/useBatchSendToShopify.ts` - Frontend consumption logic
- `src/components/CurrentBatchPanel.tsx` - UI that triggers the send operation
