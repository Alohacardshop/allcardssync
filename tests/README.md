# E2E Tests

This directory contains Playwright end-to-end tests to verify the intake and inventory sync functionality.

## Test Files

### `intake_add_to_batch.spec.ts`
Tests that "Add to Batch" operations:
- Make exactly one RPC call (`create_raw_intake_item`)
- Make **zero** edge function calls (`/functions/v1/*`)
- Successfully add items to the batch
- Show appropriate success messages

### `inventory_send_to_shopify.spec.ts`
Tests that moving items from batch to inventory:
- Triggers exactly one Shopify sync call per item (`/functions/v1/shopify-sync-inventory`)
- Sends correct payload with `storeKey`, `sku`, and `locationGid`
- Handles both single item and bulk operations correctly

## Running Tests

```bash
# Run all tests
npx playwright test

# Run with UI
npx playwright test --ui

# Run specific test file
npx playwright test tests/intake_add_to_batch.spec.ts

# Run in headed mode (see browser)
npx playwright test --headed
```

## Test Coverage

✅ **Intake Flow**: Verifies DB-only operations with no Shopify side effects  
✅ **Inventory Sync**: Verifies proper Shopify sync trigger on inventory moves  
✅ **Authentication**: Tests staff role and store/location access  
✅ **Network Isolation**: Confirms function calls only happen when expected  

## Key Assertions

1. **First Test**: `functionCalls.length === 0` (no edge functions on batch add)
2. **Second Test**: `shopifySyncCalls.length >= 1` (proper sync on inventory move)