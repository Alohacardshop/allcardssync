# Production Hardening Implementation

## ✅ Completed

### Infrastructure
- [x] **Typed configuration** (`_lib/config.ts` for edge functions, `src/lib/config.ts` for frontend)
  - Zod validation with fail-fast on missing/invalid env vars
  - Clear error messages logged to console
  
- [x] **Resilient HTTP client** (`_lib/http.ts`)
  - Automatic retries with exponential backoff + jitter
  - Configurable timeout (default 15s)
  - Up to 5 retry attempts by default

- [x] **Circuit breaker** (`_lib/circuit.ts`)
  - Opens after 5 consecutive failures
  - 2-minute cooldown before retry
  - Per-service tracking (justtcg, psa, etc.)

- [x] **Structured logging** (`_lib/log.ts`)
  - JSON format with timestamp, level, message, context
  - RequestID correlation for tracing
  - Async database logging (fire-and-forget)

- [x] **Zod schemas** (`_lib/schemas.ts`)
  - Validation for JustTCG API responses
  - PSA certificate schemas
  - Sync job schemas

- [x] **CORS configuration** (`_lib/cors.ts`)
  - Configurable allowed origins via ALLOWED_ORIGINS env var
  - CSV format support

### Database
- [x] **Queue deduplication** 
  - Added `job_type` column to `sync_queue`
  - Unique index on `(game, set_id, job_type)` for queued/processing jobs
  - Prevents duplicate work

- [x] **Structured logs table** (`catalog_v2.logs`)
  - Stores all edge function logs with request_id correlation
  - Indexed by request_id, level, and created_at
  
- [x] **PSA image cache** (`catalog_v2.psa_image_cache`)
  - Stale-while-revalidate pattern
  - 7-day cache duration
  - Stores primary URL and all image URLs

- [x] **Batch upsert RPC** (`catalog_v2.batch_upsert_cards_variants`)
  - Single call to upsert multiple cards and variants
  - Returns processing counts
  - Much faster than row-by-row upserts

### Edge Functions
- [x] **Refactored catalog-sync-justtcg**
  - Uses new HTTP client with retries
  - Circuit breaker protection
  - Structured logging with requestId
  - Batch RPC for card upserts
  - Returns X-Request-Id header

### Frontend
- [x] **SyncMonitor component**
  - Real-time queue stats (4s polling)
  - Recent logs display (5s polling)
  - Failed jobs list with retry button
  - Export errors to CSV
  - Color-coded status badges

### Testing & CI
- [x] **Unit tests** for circuit breaker pattern
- [x] **GitHub Actions CI workflow**
  - Runs on PRs and pushes to main
  - Type checking
  - Linting
  - Tests
  - Format checking

## 📋 Remaining Tasks

### Edge Functions (High Priority)
- [x] Update `psa-lookup` to use circuit breaker and structured logging ✅ Already implemented
- [x] Update `justtcg-refresh-variants` to use batch RPC ✅ Completed
- [x] Add JWT validation to mutating endpoints (keep read-only open) ✅ Completed
- [x] Implement idempotent queueing in sync functions ✅ Completed

All high-priority backend hardening tasks are now complete! 🎉

### Frontend Logging (Medium Priority)
- [x] `src/lib/printNodeService.ts`: Migrated 25+ console.log calls to logger ✅
- [x] `src/lib/authUtils.ts`: Migrated console.log to logger.info ✅
- [x] `src/lib/api.ts`: Migrated console.error to logger.error ✅
- [x] `src/lib/directLocalPrint.ts`: Migrated console.log to logger.debug ✅
- [x] `src/components/CurrentBatchPanel.tsx`: Migrated 25+ console calls to useLogger ✅
- [x] `src/components/BulkCardIntake.tsx`: Migrated 8 console calls to useLogger ✅
- [x] `src/components/GradedCardIntake.tsx`: Migrated 6 console calls to useLogger ✅
- [x] `src/components/AllLocationsSelector.tsx`: Migrated 4 console calls to useLogger ✅
- [x] `src/components/BulkTransferScanner.tsx`: Migrated 3 console calls to useLogger ✅

High-traffic component logging cleanup complete! All critical user-facing components now use structured logging. 🎉

### UI Enhancements (Medium Priority)
- [ ] Add SyncMonitor to Admin panel
- [ ] Create queue management UI (pause/resume)
- [ ] Add manual requeue button for specific sets
- [ ] Display circuit breaker status per service

### Documentation (Low Priority)
- [ ] Add API documentation for new edge functions
- [ ] Document circuit breaker behavior
- [ ] Create runbook for common issues

## 🔍 Testing Checklist

- [ ] Test circuit breaker opens after 5 failures
- [ ] Test circuit breaker allows retry after cooldown
- [ ] Test idempotent queueing (no duplicates)
- [ ] Test batch RPC performance (vs row-by-row)
- [ ] Test structured logging appears in catalog_v2.logs
- [ ] Test SyncMonitor displays real-time stats
- [ ] Test CSV export of failed jobs
- [ ] Test retry button requeues jobs

## 🚀 Deployment Notes

### Environment Variables Required
- `JUSTTCG_API_KEY` - JustTCG API key (optional, for catalog sync)
- `PSA_PUBLIC_API_TOKEN` - PSA API token (optional, for cert lookup)
- `ALLOWED_ORIGINS` - CSV of allowed CORS origins (optional, defaults to *)

### Database Migrations
All migrations have been applied. Verify:
```sql
-- Check queue deduplication index exists
SELECT indexname FROM pg_indexes WHERE tablename = 'sync_queue' AND indexname = 'sync_queue_dedupe_idx';

-- Check logs table exists
SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog_v2' AND table_name = 'logs';

-- Check PSA cache table exists
SELECT table_name FROM information_schema.tables WHERE table_schema = 'catalog_v2' AND table_name = 'psa_image_cache';

-- Check batch RPC exists
SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'catalog_v2' AND routine_name = 'batch_upsert_cards_variants';
```

## 📊 Monitoring

### Key Metrics
- Queue depth (queued + processing)
- Error rate (failed jobs / total jobs)
- Circuit breaker openings
- API latency (p50, p95, p99)
- Batch RPC performance

### Alerts
- Circuit breaker open for > 5 minutes
- Queue depth > 1000
- Error rate > 10%
- No job processing for > 10 minutes

## 🔐 Security Notes

- All SECURITY DEFINER functions use `SET search_path` (already compliant)
- Edge functions validate JWT by default (verify_jwt=true in config.toml)
- Only public read endpoints bypass JWT
- CORS restricted via ALLOWED_ORIGINS env var
- No SQL injection vectors (all queries use Supabase client methods)
