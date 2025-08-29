# JustTCG Integration - Enhanced Catalog Sync

This document provides a comprehensive guide for the JustTCG integration with 500 RPM rate limiting, analytics sorting, and automated snapshots.

## Overview

The JustTCG integration provides:
- **High-speed catalog sync** (500 RPM with 200-card pages)
- **Dual-mode refresh** (List Mode and ID Mode with analytics sorting)
- **Automated snapshots** (nightly cron jobs for price tracking)
- **Comprehensive admin UI** with real-time status and controls

## Architecture

### Edge Functions - DEPRECATED

**MIGRATION NOTICE**: Catalog syncing functionality has been moved to Alohacardshop/alohacardshopcarddatabase.

The following functions have been removed:
1. ~~**`catalog-sync-justtcg`** - Full game synchronization~~ (Removed)
2. ~~**`catalog-refresh`** - Flexible refresh with analytics sorting~~ (Removed)  
3. ~~**`catalog-snapshots`** - Historical price tracking~~ (Removed)
4. ~~**`_lib/justtcg.ts`** - Shared utilities and rate limiting~~ (May be kept for future use)

All catalog operations are now handled by the external TCG database service.

### Database Tables

- `justtcg_watchlist` - Cards to track in nightly snapshots
- `justtcg_analytics_snapshots` - Historical price data
- `catalog_v2.*` - Main catalog tables (inherited from existing system)

## Configuration

### Environment Variables

Required secrets in Supabase:

```bash
JUSTTCG_API_KEY=your_api_key_here
```

### Rate Limiting Configuration

```typescript
const CONFIG = {
  RPM: 500,                // Requests per minute
  PAGE_SIZE_GET: 200,      // Cards per GET request
  POST_BATCH_MAX: 100,     // Max IDs per POST batch
  MAX_CONCURRENT: 24,      // Concurrent set workers
  JUSTTCG_BASE: "https://api.justtcg.com/v1"
}
```

## API Endpoints - DEPRECATED

**MIGRATION NOTICE**: These endpoints have been removed. Catalog operations are now handled by Alohacardshop/alohacardshopcarddatabase.

### ~~Full Sync: `POST /catalog-sync-justtcg`~~ (Removed)

~~Synchronizes entire game catalogs with optimized performance.~~

### ~~Status Check: `GET /catalog-sync-status`~~ (Removed)

~~**IMPORTANT**: This endpoint expects query string parameters, not JSON body:~~
- `?game=pokemon&limit=50`
- Include JWT Authorization header for authentication
- Use `getCatalogSyncStatus()` helper from `src/lib/fns.ts` in UI code

**Parameters:**
- `game` (query): `magic-the-gathering`, `pokemon`, or `pokemon-japan`

**Features:**
- 500 RPM global rate limiting
- 24-36 concurrent set workers
- Smart skipping based on `lastUpdated` timestamps
- Chunked database writes (200-1000 records)

**Example (DEPRECATED):**
```bash
# These endpoints no longer exist
# curl -X POST "/functions/v1/catalog-sync-justtcg?game=magic-the-gathering"
```

**Migration Note**: Use the new external TCG database API instead.

### Flexible Refresh: `POST /catalog-refresh`

Supports both List Mode and ID Mode with advanced analytics sorting.

#### List Mode
Refresh by game/set with API-side ordering:

```json
{
  "game": "magic-the-gathering",
  "set": "unfinity",
  "orderBy": "24h",
  "order": "desc"
}
```

#### ID Mode
Refresh specific cards with server-side analytics sorting:

```json
{
  "ids": ["card-id-1", "card-id-2"],
  "orderBy": "price",
  "cardSortBy": "24h",
  "cardSortOrder": "desc",
  "variantSortBy": "price", 
  "variantSortOrder": "asc"
}
```

**Analytics Sorting:**
- `cardSortBy/cardSortOrder`: Sort cards by aggregated metrics
- `variantSortBy/variantSortOrder`: Sort variants within each card
- Metrics: `price`, `24h`, `7d`, `30d`

### Analytics Snapshots: `POST /catalog-snapshots`

**Manual Trigger:**
```bash
curl -X POST "/functions/v1/catalog-snapshots?game=pokemon"
```

**All Games (Cron):**
```bash
curl -X POST "/functions/v1/catalog-snapshots"
```

## Admin UI (`/justtcg-admin`)

### Features

1. **API Usage Dashboard**
   - Real-time request counts and limits
   - Usage percentage with color coding
   - Daily reset timer

2. **Game Sync Controls**
   - One-click sync buttons for each game
   - Progress indicators and result summaries
   - Error handling with detailed messages

3. **Dual-Mode Refresh**
   - **List Mode**: Game/set with API-side ordering
   - **ID Mode**: Bulk IDs with server-side analytics sorting
   - Live validation and input helpers

4. **Analytics Snapshots**
   - Historical price tracking viewer
   - Filterable by game, metric, and date range
   - Manual snapshot triggers
   - Top movers tables

5. **Activity Monitoring**
   - Recent logs with level indicators
   - Performance metrics
   - Configuration display

## Automation & Cron Jobs

### Secure Cron Proxy

All automated jobs now use `/catalog-cron-proxy` to prevent 401 unauthorized errors:
- **Security**: Validates `x-cron-token` header before execution
- **Authentication**: Uses service role JWT for internal function calls  
- **Scheduling**: Runs every 10 minutes for each game mode (mtg, pokemon, pokemon-japan)
- **Reliability**: Prevents direct function calls without proper authorization

### Nightly Snapshots (Cron)

Runs daily at 3:15 AM UTC:
```sql
SELECT cron.schedule(
  'justtcg-nightly-snapshots',
  '15 3 * * *',
  $$ SELECT net.http_post(url := 'https://your-project.supabase.co/functions/v1/catalog-snapshots', ...) $$
);
```

### Watchlist Management

Add cards to track:
```sql
INSERT INTO justtcg_watchlist (game, card_id) VALUES ('pokemon', 'card-123');
```

## Performance Optimization

### Rate Limiting

Uses token bucket algorithm for precise 500 RPM control:
- Global rate limiter shared across all functions
- Automatic backoff with jitter on rate limits
- Respects `Retry-After` headers

### Concurrency Control

- 24-36 concurrent set workers
- Chunked database operations (200-1000 records)
- Smart skipping based on timestamps

### Error Handling

- Exponential backoff with jitter
- Comprehensive retry logic (5 attempts)
- Structured logging for debugging

## Monitoring & Debugging

### Logs

All functions use structured JSON logging:
```json
{
  "timestamp": "2025-01-27T20:30:00Z",
  "level": "INFO",
  "message": "Set sync completed",
  "service": "catalog-sync-justtcg",
  "game": "pokemon",
  "cardsProcessed": 1500
}
```

### Key Metrics

Monitor these metrics for system health:
- API requests used/remaining
- Sync success rates
- Average processing times
- Error frequencies by type

### Troubleshooting

Common issues and solutions:

1. **Rate Limit Exceeded**
   - Check token bucket status
   - Verify 500 RPM configuration
   - Review retry logic timing

2. **Sync Timeouts**
   - Reduce concurrency (MAX_CONCURRENT)
   - Check network connectivity
   - Verify API key validity

3. **Missing Data**
   - Check RLS policies on new tables
   - Verify upsert function permissions
   - Review data sanitization logic

## Testing

### Unit Tests

Run tests for shared library:
```bash
deno test supabase/functions/_lib/tests.ts
```

### Smoke Tests

Verify system health:
```bash
# Test small set sync
curl -X POST "/functions/v1/catalog-sync-justtcg?game=pokemon&set=small-test-set"

# Test ID refresh
curl -X POST "/functions/v1/catalog-refresh" -d '{"ids":["test-card-1"]}'

# Test snapshot
curl -X POST "/functions/v1/catalog-snapshots?game=pokemon"
```

## Scaling & Tuning

### Performance Tuning

Adjust these parameters based on your needs:

```typescript
// High-volume setup (careful with API limits)
const CONFIG = {
  RPM: 500,              // Max allowed by JustTCG
  MAX_CONCURRENT: 36,    // Higher concurrency
  PAGE_SIZE_GET: 200,    // Max page size
}

// Conservative setup (slower but safer)
const CONFIG = {
  RPM: 300,              // Lower rate
  MAX_CONCURRENT: 12,    // Lower concurrency
  PAGE_SIZE_GET: 100,    // Smaller pages
}
```

### Horizontal Scaling

For very large catalogs:
1. Split games across multiple instances
2. Use different API keys for separate rate limits
3. Implement queue-based processing for peak loads

## Security & Compliance

### API Key Management
- Store keys in Supabase secrets (encrypted)
- Use service role key for edge functions
- Rotate keys periodically

### Row Level Security
- Admin-only access to watchlist and snapshots
- Staff can read snapshots for analytics
- All catalog data properly secured

### Data Handling
- Input sanitization for all JSON fields
- SQL injection prevention via RPC calls
- Proper error message sanitization

## Migration & Deployment

### ID Format Migration

The system handles both old and new JustTCG ID formats:
- Automatic tolerance in all functions
- Graceful fallback for missing IDs
- Backward compatibility maintained

### Deployment Checklist

1. ✅ Verify API keys in Supabase secrets
2. ✅ Run database migrations
3. ✅ Deploy edge functions
4. ✅ Test admin UI functionality
5. ✅ Verify cron job scheduling
6. ✅ Run smoke tests
7. ✅ Monitor initial sync performance

---

For technical support or feature requests, please refer to the JustTCG API documentation at [justtcg.com/docs](https://justtcg.com/docs).