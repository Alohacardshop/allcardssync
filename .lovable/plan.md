
# Make eBay Sync Safe in Dry Run Mode

This update adds proper dry run protection to the eBay sync processor, ensuring test items never reach the eBay API when `dry_run_mode = true`.

---

## Current Problem

The `ebay-sync-processor` edge function fetches the store config (including `dry_run_mode`) but then **ignores it** and makes real API calls to:
- `createOrUpdateInventoryItem` → Creates inventory on eBay
- `createOffer` → Creates an offer
- `publishOffer` → Makes the listing live

---

## Solution

Add a dry run check that simulates success without calling eBay APIs.

### How It Will Work

```text
┌─────────────────────────────────────────┐
│  ebay-sync-processor receives queue     │
└───────────────────┬─────────────────────┘
                    ▼
┌─────────────────────────────────────────┐
│  Fetch storeConfig for the store        │
│  (includes dry_run_mode flag)           │
└───────────────────┬─────────────────────┘
                    ▼
            ┌───────────────┐
            │ dry_run_mode? │
            └───────┬───────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
   [true]                    [false]
        │                       │
        ▼                       ▼
┌───────────────────┐  ┌───────────────────┐
│ SIMULATE SUCCESS  │  │ REAL eBay API     │
│ • Log dry run     │  │ • createInventory │
│ • Mark completed  │  │ • createOffer     │
│ • Fake IDs        │  │ • publishOffer    │
│ • Update DB       │  │ • Update DB       │
└───────────────────┘  └───────────────────┘
```

---

## Changes to `ebay-sync-processor/index.ts`

### 1. Add Dry Run Check Before Processing

After fetching `storeConfig`, check if dry run is enabled:

```typescript
const isDryRun = storeConfig.dry_run_mode === true

if (isDryRun) {
  console.log(`[ebay-sync-processor] DRY RUN MODE for ${currentStoreKey} - skipping real API calls`)
}
```

### 2. Modify `processCreate` to Accept Dry Run Flag

Pass `isDryRun` to processing functions:

```typescript
case 'create':
  syncResult = await processCreate(supabase, accessToken, environment, item, storeConfig, isDryRun)
  break
```

### 3. Simulate Success in Dry Run Mode

Inside `processCreate`:

```typescript
if (isDryRun) {
  const fakeOfferId = `DRY-RUN-OFFER-${Date.now()}`
  const fakeListingId = `DRY-RUN-LISTING-${Date.now()}`
  
  // Update database with simulated data
  await supabase
    .from('intake_items')
    .update({
      ebay_inventory_item_sku: ebaySku,
      ebay_offer_id: fakeOfferId,
      ebay_listing_id: fakeListingId,
      ebay_listing_url: `[DRY RUN] Would list at ebay.com/itm/${fakeListingId}`,
      ebay_sync_status: 'dry_run',
      ebay_sync_error: null,
      last_ebay_synced_at: new Date().toISOString(),
      ebay_sync_snapshot: {
        timestamp: new Date().toISOString(),
        action: 'create',
        dry_run: true,
        simulated: true,
      },
    })
    .eq('id', item.id)

  return { success: true, data: { listing_id: fakeListingId, dry_run: true } }
}

// ... real API calls below
```

### 4. Similar Changes for `processUpdate` and `processDelete`

Each function will check the dry run flag and simulate success without calling eBay APIs.

---

## What Changes in the Response

The processor will return `dryRun: true` in its response:

```json
{
  "success": true,
  "processed": 3,
  "succeeded": 3,
  "failed": 0,
  "dryRun": true
}
```

The E2E Test Dashboard already shows this indicator.

---

## Database Values in Dry Run

| Field | Value |
|-------|-------|
| `ebay_sync_status` | `'dry_run'` |
| `ebay_offer_id` | `'DRY-RUN-OFFER-...'` |
| `ebay_listing_id` | `'DRY-RUN-LISTING-...'` |
| `ebay_listing_url` | `'[DRY RUN] Would list at...'` |

This makes it obvious which items were processed in test mode.

---

## Safety Guarantees After This Change

| Scenario | What Happens |
|----------|--------------|
| `dry_run_mode = true` | No eBay API calls made, queue completes with simulated data |
| `dry_run_mode = false` | Real eBay API calls as normal |
| Test items (TEST-*) | Safe regardless of mode, but dry run adds extra protection |

---

## Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/ebay-sync-processor/index.ts` | Add dry run logic to skip API calls |

---

## Verification

After implementing, you can:
1. Generate test items in E2E dashboard
2. Queue for eBay and process
3. Check that items show `ebay_sync_status = 'dry_run'`
4. Verify no actual eBay listings were created
