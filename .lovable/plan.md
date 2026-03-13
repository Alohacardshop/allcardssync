

## Fix: Rate-Limiting in `bulk-comic-repair/index.ts`

### Problem
The function processes 10 items in parallel via `Promise.all`, each triggering 2-7 Shopify API calls. That's up to 70 concurrent calls — far exceeding Shopify's 4 calls/second limit. Results: 429 errors, retries pile up, edge function times out.

### Changes (single file: `supabase/functions/bulk-comic-repair/index.ts`)

**1. Sequential processing (concurrency = 1)**
- Remove the `BATCH_SIZE = 10` batching with `Promise.all`
- Replace with a simple `for...of` loop that processes one comic at a time in execute mode
- Preview mode can stay parallel (read-only GETs are less rate-sensitive) but will also be made sequential for safety

**2. Pacing between API calls**
- Add a `pace()` helper: 300ms delay after every Shopify API call (keeps us under 3.3 calls/sec, well within the 4/sec limit)
- Applied after every `shopifyFetchWithRetry` call and after `ensureMediaOrder`

**3. Rate-limit-aware backoff**
- After any 429 response, log `comic_bulk_repair_rate_limited` and wait 2 seconds (or `Retry-After` header value) before continuing
- The item is retried once after the backoff; if it fails again, it's marked failed and processing continues

**4. Lower default limit**
- Change default `limit` from 500 to 50
- With ~5 API calls per item at 300ms pacing, 50 items takes ~75 seconds — safely within edge function timeout (~120s)

**5. New structured log events**
- `comic_bulk_repair_rate_limited` — when a 429 is detected
- `comic_bulk_repair_backoff` — when backing off after rate limit
- `comic_bulk_repair_progress` — after every 10 items processed
- `comic_bulk_repair_completed` — already exists, will add `skipped` count

**6. Summary improvements**
- Add `total_skipped` to the response summary for items skipped due to rate limiting
- Add `total_rate_limited` count

### What stays unchanged
- Preview mode logic (same diff comparison)
- Comic title/description/metafield generation logic
- Image resolution via `determineFrontImageUrl`
- All interfaces (`RepairDiff`, `RepairResult`)

### Technical detail

```text
BEFORE:  [10 items] → Promise.all → 20-70 API calls burst → 429 → timeout
AFTER:   [1 item]   → sequential → ~5 calls → 300ms pace → next item → ...
         50 items × ~5 calls × 300ms = ~75s (within 120s timeout)
```

