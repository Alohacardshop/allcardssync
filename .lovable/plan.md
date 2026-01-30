
# Production-Grade 1-of-1 Inventory Sync System

## Overview

This plan implements a robust, race-condition-proof inventory sync system for a multi-location card shop. Each SKU represents exactly one physical card, and the system ensures that at any given time, Shopify inventory is 1 at exactly ONE location and 0 at all others.

---

## Current State Analysis

### What Already Exists
- **`cards` table**: Created with `sku`, `status` enum, `shopify_inventory_item_id`, `shopify_variant_id`, `current_shopify_location_id`, `ebay_offer_id`
- **`sales_events` table**: Idempotency log with `source_event_id` unique constraint
- **`atomic_mark_card_sold()` function**: Atomic sale locking that prevents race conditions
- **Shopify webhook** (`shopify-webhook`): Handles order/inventory events but doesn't use atomic locking
- **eBay webhook** (`ebay-order-webhook`): Handles eBay orders via waterfall deduction on `intake_items`
- **Shopify helpers**: `setInventory()`, `loadStore()`, `findVariantsBySKU()` in `_shared/shopify-helpers.ts`
- **eBay helpers**: `ebay-update-inventory` function for setting eBay quantity

### What's Missing
1. **`retry_jobs` table**: For reliable retry of failed operations
2. **`enforce_single_location_stock()` function**: To enforce the 1-location invariant
3. **Integration of `atomic_mark_card_sold()`** into Shopify/eBay webhooks
4. **Location drift detection**: Periodic sync to track card locations from Shopify Transfers
5. **Edge function for sale processing**: Uses atomic lock + cross-channel sync

---

## Phase 1: Database Schema Updates

### 1.1 Create `retry_jobs` Table

```sql
-- Job types for retry queue
CREATE TYPE retry_job_type AS ENUM (
  'END_EBAY',           -- End eBay listing (set qty=0)
  'SET_SHOPIFY_ZERO',   -- Set Shopify inventory to 0
  'ENFORCE_LOCATION'    -- Enforce single-location invariant
);

CREATE TYPE retry_job_status AS ENUM (
  'queued',
  'running', 
  'done',
  'dead'
);

CREATE TABLE retry_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type retry_job_type NOT NULL,
  sku TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 5,
  next_run_at TIMESTAMPTZ DEFAULT now(),
  last_error TEXT,
  status retry_job_status NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for job processing
CREATE INDEX idx_retry_jobs_status_next_run 
  ON retry_jobs(status, next_run_at) 
  WHERE status = 'queued';
CREATE INDEX idx_retry_jobs_sku ON retry_jobs(sku);
```

### 1.2 Create `location_drift_flags` Table

```sql
-- Track location drift issues for manual review
CREATE TABLE location_drift_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL,
  card_id UUID REFERENCES cards(id),
  drift_type TEXT NOT NULL, -- 'multi_location' | 'no_location' | 'location_mismatch'
  expected_location_id TEXT,
  actual_locations JSONB, -- Array of {location_id, qty}
  detected_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  notes TEXT
);

CREATE INDEX idx_location_drift_unresolved 
  ON location_drift_flags(detected_at) 
  WHERE resolved_at IS NULL;
```

---

## Phase 2: Core Functions

### 2.1 Enforce Single Location Stock Function

```sql
-- Database function to record enforcement intent
CREATE OR REPLACE FUNCTION record_location_enforcement(
  p_sku TEXT,
  p_desired_location_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  -- Update cards table with desired location
  UPDATE cards 
  SET current_shopify_location_id = p_desired_location_id,
      updated_at = now()
  WHERE sku = p_sku;
  
  -- Create enforcement job
  INSERT INTO retry_jobs (job_type, sku, payload, status)
  VALUES ('ENFORCE_LOCATION', p_sku, jsonb_build_object(
    'desired_location_id', p_desired_location_id
  ), 'queued')
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;
```

### 2.2 Queue eBay End Listing Job

```sql
CREATE OR REPLACE FUNCTION queue_ebay_end_listing(
  p_sku TEXT,
  p_ebay_offer_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_job_id UUID;
BEGIN
  INSERT INTO retry_jobs (job_type, sku, payload, status)
  VALUES ('END_EBAY', p_sku, jsonb_build_object(
    'ebay_offer_id', p_ebay_offer_id
  ), 'queued')
  RETURNING id INTO v_job_id;
  
  RETURN v_job_id;
END;
$$;
```

---

## Phase 3: Edge Functions

### 3.1 `process-card-sale` Edge Function

New edge function that processes sales from any channel with atomic locking:

```
supabase/functions/process-card-sale/index.ts
```

**Responsibilities:**
1. Receive sale notification (SKU, source, source_event_id)
2. Call `atomic_mark_card_sold()` RPC
3. If result is 'sold':
   - If eBay: Call Shopify to set inventory to 0 at owning location
   - If Shopify: Call eBay to end listing (if `ebay_offer_id` exists)
   - On failure: Queue retry job
4. Return idempotent success

**Flow diagram:**

```text
┌─────────────────────────────────────────────────────────────┐
│                   process-card-sale                         │
├─────────────────────────────────────────────────────────────┤
│  Input: { sku, source, source_event_id }                    │
│                                                             │
│  1. Call atomic_mark_card_sold(sku, source, source_event_id)│
│     │                                                       │
│     ├─► 'duplicate_event' → Return 200 OK                   │
│     ├─► 'already_sold'    → Return 200 OK                   │
│     ├─► 'not_found'       → Return 200 OK (log warning)     │
│     └─► 'sold'            → Continue to step 2              │
│                                                             │
│  2. Fetch card details (ebay_offer_id, location)            │
│                                                             │
│  3. If source == 'ebay':                                    │
│     └─► Set Shopify inventory to 0 at current_location      │
│         └─► On failure: queue SET_SHOPIFY_ZERO job          │
│                                                             │
│  4. If source == 'shopify' && ebay_offer_id exists:         │
│     └─► End eBay listing (qty=0)                            │
│         └─► On failure: queue END_EBAY job                  │
│                                                             │
│  5. Return 200 OK                                           │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 `enforce-single-location-stock` Edge Function

New edge function to enforce the 1-location invariant:

```
supabase/functions/enforce-single-location-stock/index.ts
```

**Responsibilities:**
1. Receive SKU and desired_location_id
2. Fetch all Shopify locations for the store
3. Set inventory to 1 at desired_location_id
4. Set inventory to 0 at all other locations
5. Update `cards.current_shopify_location_id`

### 3.3 `process-retry-jobs` Edge Function

Cron-triggered function to process retry queue:

```
supabase/functions/process-retry-jobs/index.ts
```

**Runs every 1-2 minutes via pg_cron:**
1. Fetch jobs WHERE status='queued' AND next_run_at <= now()
2. For each job:
   - Set status='running'
   - Execute based on job_type
   - On success: status='done'
   - On failure: increment attempts, set next_run_at with exponential backoff
   - If attempts >= max_attempts: status='dead' (alert admin)

### 3.4 `sync-card-locations` Edge Function

Periodic function to detect location from Shopify Transfers:

```
supabase/functions/sync-card-locations/index.ts
```

**Runs every 5-15 minutes via pg_cron:**
1. For each card with status='available':
2. Query Shopify inventory levels for the inventory_item_id
3. Find locations with qty > 0
4. If exactly 1 location: update `cards.current_shopify_location_id`
5. If multiple locations with qty > 0: flag drift
6. If no locations with qty > 0: flag drift

---

## Phase 4: Webhook Integration

### 4.1 Update `shopify-webhook` for Orders

Modify `handleOrderUpdate()` to use atomic locking:

```typescript
// For each graded line item:
const { data: saleResult } = await supabase.rpc('atomic_mark_card_sold', {
  p_sku: sku,
  p_source: 'shopify',
  p_source_event_id: `${orderId}_${sku}`
});

if (saleResult[0]?.result === 'sold') {
  // Card was just sold - need to end eBay listing
  const { data: card } = await supabase
    .from('cards')
    .select('ebay_offer_id')
    .eq('sku', sku)
    .single();
  
  if (card?.ebay_offer_id) {
    // Try to end eBay listing
    const ebayResult = await endEbayListing(supabase, sku, card.ebay_offer_id);
    if (!ebayResult.success) {
      // Queue for retry
      await supabase.rpc('queue_ebay_end_listing', {
        p_sku: sku,
        p_ebay_offer_id: card.ebay_offer_id
      });
    }
  }
}
// If result is 'already_sold' or 'duplicate_event', do nothing (idempotent)
```

### 4.2 Update `ebay-order-webhook` for Orders

Modify to use atomic locking:

```typescript
// For each line item SKU:
const sourceEventId = `${orderId}_${sku}`;

const { data: saleResult } = await supabase.rpc('atomic_mark_card_sold', {
  p_sku: sku,
  p_source: 'ebay',
  p_source_event_id: sourceEventId
});

if (saleResult[0]?.result === 'sold') {
  // Card was just sold - need to set Shopify inventory to 0
  const { data: card } = await supabase
    .from('cards')
    .select('shopify_inventory_item_id, current_shopify_location_id')
    .eq('sku', sku)
    .single();
  
  if (card?.shopify_inventory_item_id && card?.current_shopify_location_id) {
    // Try to zero Shopify inventory
    const shopifyResult = await setShopifyInventory(
      domain, token, 
      card.shopify_inventory_item_id, 
      card.current_shopify_location_id, 
      0
    );
    
    if (!shopifyResult.success) {
      // Queue for retry
      await supabase.from('retry_jobs').insert({
        job_type: 'SET_SHOPIFY_ZERO',
        sku,
        payload: {
          inventory_item_id: card.shopify_inventory_item_id,
          location_id: card.current_shopify_location_id
        }
      });
    }
  }
}
```

---

## Phase 5: Card Registration

### 5.1 Card Import/Registration Function

When a new card is added to the system:

```typescript
async function registerCard(
  sku: string, 
  shopifyVariantId: string,
  shopifyInventoryItemId: string,
  initialLocationId: string,
  ebayOfferId?: string
) {
  // 1. Insert into cards table
  await supabase.from('cards').insert({
    sku,
    shopify_variant_id: shopifyVariantId,
    shopify_inventory_item_id: shopifyInventoryItemId,
    current_shopify_location_id: initialLocationId,
    ebay_offer_id: ebayOfferId,
    status: 'available'
  });
  
  // 2. Enforce single-location invariant
  await supabase.functions.invoke('enforce-single-location-stock', {
    body: { sku, desired_location_id: initialLocationId }
  });
}
```

---

## Phase 6: Cron Jobs Setup

### 6.1 Retry Job Processor (Every 1 minute)

```sql
SELECT cron.schedule(
  'process-retry-jobs',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/process-retry-jobs',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
  );
  $$
);
```

### 6.2 Location Sync (Every 10 minutes)

```sql
SELECT cron.schedule(
  'sync-card-locations',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dmpoandoydaqxhzdjnmk.supabase.co/functions/v1/sync-card-locations',
    headers := '{"Authorization": "Bearer <ANON_KEY>"}'::jsonb
  );
  $$
);
```

---

## File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/xxx_retry_jobs.sql` | Create | retry_jobs table, location_drift_flags, helper functions |
| `supabase/functions/process-card-sale/index.ts` | Create | Central sale processing with atomic lock |
| `supabase/functions/enforce-single-location-stock/index.ts` | Create | Enforce 1-location invariant |
| `supabase/functions/process-retry-jobs/index.ts` | Create | Retry queue processor |
| `supabase/functions/sync-card-locations/index.ts` | Create | Periodic location sync from Shopify |
| `supabase/functions/shopify-webhook/index.ts` | Modify | Integrate atomic_mark_card_sold for orders |
| `supabase/functions/ebay-order-webhook/index.ts` | Modify | Integrate atomic_mark_card_sold for orders |
| `supabase/config.toml` | Modify | Add new function configurations |
| `src/components/admin/LocationDriftMonitor.tsx` | Create | UI to view/resolve drift flags |

---

## Technical Specifications

### Race Condition Prevention

The atomic lock uses PostgreSQL's `UPDATE ... WHERE ... RETURNING` pattern:

```sql
UPDATE cards 
SET status = 'sold'
WHERE sku = :sku AND status = 'available'
RETURNING *;
```

Only ONE concurrent request can succeed - PostgreSQL row-level locking ensures this.

### Idempotency

Every sale event has a unique `source_event_id`:
- Shopify: `{order_id}_{sku}`
- eBay: `{ebay_order_id}_{sku}`

The `sales_events.source_event_id` UNIQUE constraint prevents duplicate processing.

### Retry Strategy

Exponential backoff with jitter:
```
next_run_at = now() + (2^attempts * 30 seconds) + random(0-30 seconds)
```

Max 5 attempts before marking as 'dead'.

---

## Implementation Order

1. **Database Migration** - Create retry_jobs, location_drift_flags, helper functions
2. **enforce-single-location-stock** - Core invariant enforcement
3. **process-card-sale** - Central sale processor
4. **Update shopify-webhook** - Integrate atomic locking
5. **Update ebay-order-webhook** - Integrate atomic locking
6. **process-retry-jobs** - Retry queue processor
7. **sync-card-locations** - Location drift detection
8. **Cron jobs** - Schedule periodic tasks
9. **LocationDriftMonitor UI** - Admin visibility

---

## Monitoring & Alerts

### Key Metrics to Track
- Sales events by status (processed/ignored/failed)
- Retry jobs by status (queued/running/done/dead)
- Location drift flags (unresolved count)
- Cross-channel sync latency

### Alert Conditions
- Any retry job reaches 'dead' status
- Drift flags > 10 unresolved
- Sale processing latency > 30 seconds
