

## Fix: Instant eBay Push After Toggle

### Problem
1. The `ebay-sync-processor` cron job has zero logs — it's either not configured in `pg_cron` or broken
2. Even if it worked, waiting 3 minutes is unnecessary for single-item toggles

### Solution
Add an immediate `supabase.functions.invoke('ebay-sync-processor')` call in the `toggleListOnEbay` function right after inserting the queue entry. This mirrors how the Shopify sync works — queue + immediate trigger.

### Changes

**`src/hooks/useEbayListing.ts`** — After the queue upsert (line 38), add:
```typescript
// Immediately trigger the processor (don't await — fire and forget)
supabase.functions.invoke('ebay-sync-processor', {
  body: { batch_size: 1 }
}).catch(() => {}) // Silent fail — cron will retry
```

This gives instant processing while the cron remains as a safety net for any missed items.

### Also check
- Verify the `pg_cron` schedule exists for `ebay-sync-processor` as a backup — if it doesn't, we should add it

