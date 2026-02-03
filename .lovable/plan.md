
# End-to-End Test Workflow: Inventory → Shopify → eBay → Print Labels

This plan creates a dedicated **Test Mode** page that allows you to run synthetic test data through the entire pipeline without affecting production inventory.

---

## What This Will Do

A single "Test Dashboard" page at `/admin/e2e-test` that lets you:

1. **Create Test Items** - Generate 1-5 fake inventory items with realistic trading card data
2. **Sync to Shopify** - Push test items to Shopify (dry run or real based on toggle)
3. **Sync to eBay** - Queue items for eBay and process (dry run mode protects you)
4. **Print Labels** - Generate ZPL and send to QZ Tray for label printing
5. **Cleanup** - Delete test items when done

---

## Test Data Examples

The generator will create items like:

| Field | Example Value |
|-------|---------------|
| **SKU** | `TEST-A3X7YQ` |
| **Brand** | Pokemon, Magic, Yu-Gi-Oh! |
| **Subject** | Charizard, Black Lotus, Blue Eyes |
| **Variant** | Base Set, First Edition |
| **Price** | $49.99 |
| **Grade** | PSA 9, PSA 10, or Raw |
| **Store** | hawaii |
| **Location** | Your configured Shopify location |

---

## Implementation Steps

### Step 1: Create E2E Test Page Component

**File**: `src/pages/E2ETestPage.tsx`

A new page with the following sections:

1. **Test Item Generator**
   - Button to generate 1, 3, or 5 test items
   - Uses `TestDataGenerators.inventoryItem()` pattern
   - Inserts via `useAddIntakeItem` hook or direct RPC

2. **Shopify Sync Tester**
   - Shows test items and their Shopify sync status
   - "Sync to Shopify" button invokes `shopify-sync` edge function
   - Displays sync results and any errors

3. **eBay Sync Tester**
   - "Mark for eBay" toggles `list_on_ebay` flag
   - "Queue for eBay" adds to `ebay_sync_queue`
   - "Process Queue" invokes `ebay-sync-processor`
   - Shows dry-run results (since `dry_run_mode = true`)

4. **Label Printer Tester**
   - Preview generated labels for test items
   - Uses `generateZPLFromLabelData()` from labelRenderer
   - Sends to QZ Tray via `useQzTray` hook
   - Works with your existing Zebra printer

5. **Cleanup Section**
   - "Delete All Test Items" button
   - Filters by `sku LIKE 'TEST-%'`
   - Removes from intake_items and any sync queues

---

### Step 2: Add Route Configuration

**File**: `src/App.tsx` (or routes config)

Add route: `/admin/e2e-test`

---

### Step 3: Create Test Data Generator Utility

**File**: `src/lib/testDataGenerator.ts`

```text
Function: generateTestInventoryItems(count: number)

Returns array of intake_items with:
- sku: `TEST-${randomString}`
- store_key: 'hawaii' (uses your connected store)
- shopify_location_gid: from your store config
- Realistic card data (Pokemon, Magic, etc.)
- Random prices $10-500
- Optional grade (PSA 8-10) or Raw
- list_on_shopify: true
- list_on_ebay: true (for testing)
```

---

### Step 4: Add Sidebar Navigation Link

**File**: `src/components/admin/AdminSidebar.tsx` (or equivalent)

Add menu item: "E2E Testing" under Admin section

---

## UI Mockup

```text
┌─────────────────────────────────────────────────────────────┐
│  E2E Test Dashboard                                         │
│  Test the full Shopify/eBay/Print workflow with fake data  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌── Step 1: Generate Test Items ──────────────────────────┐│
│  │                                                          ││
│  │  [Generate 1 Item]  [Generate 3 Items]  [Generate 5]    ││
│  │                                                          ││
│  │  Created: 3 test items (TEST-A3X7YQ, TEST-B2Y8ZR, ...)  ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Step 2: Sync to Shopify ──────────────────────────────┐│
│  │                                                          ││
│  │  [ ] Dry Run Mode                                        ││
│  │                                                          ││
│  │  [Sync Selected to Shopify]                              ││
│  │                                                          ││
│  │  ✓ TEST-A3X7YQ - Synced (Product ID: 123456789)         ││
│  │  ✓ TEST-B2Y8ZR - Synced (Product ID: 123456790)         ││
│  │  ✗ TEST-C1Z9WQ - Failed: Rate limited                   ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Step 3: Sync to eBay ─────────────────────────────────┐│
│  │                                                          ││
│  │  Status: DRY RUN MODE ENABLED (safe testing)             ││
│  │                                                          ││
│  │  [Queue for eBay]  [Process Queue]                       ││
│  │                                                          ││
│  │  ✓ TEST-A3X7YQ - Queued → Processed (dry run)           ││
│  │  ✓ TEST-B2Y8ZR - Queued → Processed (dry run)           ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Step 4: Print Labels ─────────────────────────────────┐│
│  │                                                          ││
│  │  Printer: ZD421-203dpi-ZPL (Connected ✓)                 ││
│  │                                                          ││
│  │  [Print All Test Labels]  [Print Selected]               ││
│  │                                                          ││
│  │  Preview:                                                ││
│  │  ┌─────────────────────┐                                 ││
│  │  │ PSA 9    |  $149.99 │                                 ││
│  │  │ |||||||||||||||||||  │                                 ││
│  │  │ Pokemon Charizard   │                                 ││
│  │  └─────────────────────┘                                 ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌── Cleanup ──────────────────────────────────────────────┐│
│  │                                                          ││
│  │  ⚠️ This will permanently delete all TEST-* items       ││
│  │                                                          ││
│  │  [Delete All Test Items]                                 ││
│  │                                                          ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Details

### Files to Create

| File | Purpose |
|------|---------|
| `src/pages/E2ETestPage.tsx` | Main test dashboard component |
| `src/lib/testDataGenerator.ts` | Utility for generating test items |
| `src/hooks/useE2ETest.ts` | Hook for managing test workflow state |

### Files to Modify

| File | Change |
|------|--------|
| `src/App.tsx` | Add `/admin/e2e-test` route |
| `src/components/admin/AdminSidebar.tsx` | Add navigation link |

### Edge Functions Used

- `shopify-sync` - Sync to Shopify
- `ebay-sync-processor` - Process eBay queue
- Label printing uses client-side QZ Tray (no edge function)

### Database Queries

```sql
-- Insert test item
INSERT INTO intake_items (
  sku, store_key, shopify_location_gid, brand_title, 
  subject, price, quantity, list_on_shopify, list_on_ebay, ...
) VALUES (...);

-- Cleanup test items
DELETE FROM ebay_sync_queue WHERE inventory_item_id IN (
  SELECT id FROM intake_items WHERE sku LIKE 'TEST-%'
);
DELETE FROM intake_items WHERE sku LIKE 'TEST-%';
```

---

## Safety Features

1. **Test SKU Prefix**: All test items have `TEST-` prefix for easy identification
2. **Dry Run Mode**: eBay sync in dry run (already enabled in your config)
3. **Shopify Toggle**: Option to skip actual Shopify API calls
4. **Cleanup Button**: Easy removal of all test data
5. **No Production Interference**: Test items are isolated by SKU pattern

---

## Estimated Implementation Time

- E2ETestPage.tsx: 2-3 hours
- testDataGenerator.ts: 30 minutes
- Route + navigation: 15 minutes
- Testing the flow: 1 hour

**Total: ~4-5 hours**
