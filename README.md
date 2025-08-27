# AllCards Sync

A modern inventory management and label printing system for trading card games.

## Features

- **Card Catalog Management**: Comprehensive database with MTG, Pokémon (English & Japanese), and other TCG support
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
- Sync job queueing
- Status endpoint

## Ingestion & Progress

### Queue All Pending

The admin interface provides a "Queue All Pending" button that:
1. Fetches all sets for the selected game from external APIs
2. Creates import job entries in `catalog_v2.import_jobs`
3. Queues individual set sync jobs
4. Provides real-time progress tracking

### Import Jobs System

Import jobs are tracked in `catalog_v2.import_jobs` with the following lifecycle:

- **queued**: Job created, waiting to process
- **running**: Currently fetching and processing cards
- **succeeded**: Completed successfully with card counts
- **failed**: Failed with error message
- **cancelled**: Manually cancelled

### Status API

The `catalog-sync-status` endpoint provides:
```json
{
  "id": "uuid",
  "source": "justtcg",
  "game": "mtg",
  "set_id": "set-code",
  "set_code": "display-code",
  "total": 100,
  "inserted": 95,
  "status": "succeeded",
  "error": null,
  "started_at": "2024-01-01T10:00:00Z",
  "finished_at": "2024-01-01T10:05:00Z",
  "created_at": "2024-01-01T09:59:00Z",
  "updated_at": "2024-01-01T10:05:00Z"
}
```

### Security Model

- **import_jobs**: Read-only for authenticated users, writes restricted to service role
- Edge Functions use service role to bypass RLS for job management
- Admin interface polls status endpoint every 5 seconds during active syncs

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

If issues arise with the import jobs system:
- `DROP TABLE catalog_v2.import_jobs;` (if needed)
- Remove `catalog-sync-status` function directory
- Revert Admin UI changes (button + table)
- No change to `catalog_v2.stats()` or existing data
