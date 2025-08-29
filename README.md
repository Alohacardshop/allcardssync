# AllCards Sync

A modern inventory management and label printing system for trading card games.

## Features

- **Card Catalog Management**: Comprehensive database with MTG, Pokémon (English & Japanese), and other TCG support
- **Modern Sync System**: Advanced sync_v3 with performance optimization, real-time monitoring, and error tracking
- **Inventory Tracking**: Raw intake, PSA submissions, and product management
- **Label Design & Print**: Visual label designer with real-time preview and print management
- **Shopify Integration**: Two-way sync for inventory and order management
- **Admin Dashboard**: Health monitoring, sync management, and configuration tools

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (PostgreSQL, Edge Functions, Auth)
- **UI Components**: Radix UI, shadcn/ui
- **State Management**: React Query
- **Routing**: React Router DOM

## Development

### Prerequisites

- Node.js 18+
- Supabase CLI
- npm or pnpm

### Setup

```bash
git clone <repository>
cd allcardssync
npm install
npm run dev
```

### Environment Configuration

Add the required secrets via the Supabase dashboard:

1. **JustTCG API Key** (`JUSTTCG_API_KEY`):
   - Required for card catalog synchronization
   - Obtain from [JustTCG API Dashboard](https://api.justtcg.com)
   - Used by sync-games-v2, sync-sets-v2, and sync-cards-v2 functions

2. **Optional Configuration**:
   - `SYNC_BATCH_SIZE`: Default batch size for card processing (default: 100)
   - `SYNC_RATE_LIMIT_MS`: Rate limiting between API calls (default: 100ms)
   - `SYNC_MAX_RETRIES`: Maximum retry attempts for failed requests (default: 3)

### Database Architecture

The system uses the `catalog_v2` schema for card data with normalized game slugs:
- `mtg` (Magic: The Gathering)
- `pokemon` (Pokémon English)
- `pokemon-japan` (Pokémon Japanese)

### Smoke Tests

Run quick system verification:

```bash
bash scripts/smoke.sh
```

This tests:
- Card search API
- Catalog stats query
- Modern sync system (sync_v3.jobs)
- JustTCG API connectivity
- Health monitoring endpoints

## Modern Sync System (sync_v3)

### Architecture Overview

The new sync system uses the `sync_v3` schema with advanced features:

1. **Performance Optimization**: Configurable batch sizes, connection pooling, smart pagination
2. **Real-time Monitoring**: Live progress tracking, performance metrics, error categorization  
3. **Advanced Features**: Scheduled syncs, webhook notifications, data validation
4. **Admin Tools**: Configuration management, analytics dashboard, health monitoring

### Sync Jobs Lifecycle

Jobs are tracked in `sync_v3.jobs` with the following states:

- **pending**: Job created, waiting to process
- **running**: Currently fetching and processing data
- **completed**: Finished successfully with metrics
- **failed**: Failed with detailed error information
- **cancelled**: Manually cancelled by admin

### API Endpoints

- `sync-games-v2`: Sync game catalog from JustTCG API
- `sync-sets-v2`: Sync sets for a specific game
- `sync-cards-v2`: Sync cards for a specific set
- `health-monitor`: System health checks and monitoring
- `sync-scheduler`: Automated scheduling system

### Real-time Features

- **Live Updates**: Real-time job progress via Supabase realtime
- **Performance Metrics**: Cards/second, API response times, memory usage
- **Error Tracking**: Detailed error logs with categorization and retry logic
- **Health Monitoring**: Automated system health checks with alerting

### Security Model

- **sync_v3.jobs**: Admin-only write access, read access for authenticated users
- **sync_v3.config**: Admin-only configuration management
- **sync_v3.metrics**: Performance data accessible to staff and admins
- Edge Functions use service role with proper RLS policies

## Key Concepts

### Catalog Synchronization

The system syncs card data into the `catalog_v2` schema with three main entities:
- **Sets**: Game releases with metadata
- **Cards**: Individual card data with images and identifiers  
- **Variants**: Different printings, conditions, and pricing

### Print System

Label templates support dynamic field replacement and can be rendered server-side for consistent output across different printers.

### Authentication & Authorization

Role-based access control with RLS policies:
- `admin`: Full system access
- `staff`: Inventory and print operations
- `user`: Basic read access

## Deployment & Security

- **Deployment**: Lovable platform with auto-deployment of edge functions
- **Security**: RLS policies, `SECURITY DEFINER` for edge functions, encrypted API keys
- **Performance**: Trigram indexes for fuzzy search, connection pooling

### Database Query Guidelines

Always use schema-qualified queries for catalog data:
```typescript
// ✅ Correct
const { data } = await sb.schema('catalog_v2').from('cards').select()

// ❌ Incorrect
const { data } = await sb.from('catalog_v2_cards').select()
```

## Contributing

1. Follow existing code patterns and component structure
2. Ensure RLS policies are properly configured for new tables
3. Test edge functions locally before deployment
4. Update this README for significant changes

## Rollback Plan

If issues arise with the modern sync system:

### Database Rollback
```sql
-- Drop sync_v3 schema if needed
DROP SCHEMA IF EXISTS sync_v3 CASCADE;
```

### Edge Functions Rollback
- Remove `sync-games-v2`, `sync-sets-v2`, `sync-cards-v2` function directories
- Remove `health-monitor` and `sync-scheduler` function directories
- Revert to previous sync functions if needed

### UI Rollback
- Revert `ModernSyncDashboard` component changes
- Remove `SyncConfiguration` and `SyncAnalytics` components
- No change to `catalog_v2` data (preserved)
