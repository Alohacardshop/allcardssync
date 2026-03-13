

## Speed Up eBay Sync Processor

**Current throughput**: ~10 items every 3 minutes = ~200 items/hour. With 64 queued items, that's ~20 minutes to clear.

### Bottlenecks identified

| Bottleneck | Current | Impact |
|---|---|---|
| Batch size | 10 (default) | Only 10 items per invocation |
| Cron interval | 3 minutes | Long wait between batches |
| Processing | Fully sequential | Each item waits for the previous one |
| Inter-item delay | 100ms | Minor but unnecessary for small batches |
| No self-chaining | — | If queue has 64 items, must wait for next cron tick |

### Plan

#### 1. Increase default batch size (10 → 25)
In `ebay-sync-processor/index.ts`, change the default from 10 to 25. eBay's rate limits (5,000 calls/day) can easily handle this — each item uses ~3-4 API calls, so 25 items = ~100 calls per run.

#### 2. Add self-chaining
After processing a batch, if there are still queued items remaining, the function re-invokes itself (fire-and-forget) before returning. This eliminates the 3-minute cron wait between batches. A `depth` counter prevents runaway recursion (max 5 chains).

#### 3. Process items in parallel (concurrency = 3)
Instead of processing items one-by-one within a store, process up to 3 items concurrently using `Promise.allSettled` on small chunks. This is safe within eBay's rate limits and cuts per-batch time by ~3x.

#### 4. Reduce inter-item delay (100ms → 50ms)
Only applied between parallel chunks, not between individual items within a chunk.

#### 5. Update cron interval (3 min → 1 min)
Provide an updated SQL statement for the cron schedule. Combined with self-chaining this mostly serves as a reliability fallback.

### Expected throughput after changes

- ~75 items per invocation (25 batch × 3 chains)
- ~3x faster per batch (parallel processing)
- Estimated: **~500-700 items/hour** vs current ~200

### Files to modify

- `supabase/functions/ebay-sync-processor/index.ts` — batch size, parallelism, self-chaining
- Cron SQL — reduce interval to 1 minute

### Safety measures
- Concurrency capped at 3 to respect eBay rate limits
- Self-chain depth capped at 5 to prevent runaway loops
- Existing lock checks and sold-card guards remain unchanged
- Each parallel chunk still respects inventory locks

