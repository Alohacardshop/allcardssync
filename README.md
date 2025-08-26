# AllCards Sync

A modern inventory management and label printing system for trading card games, built with React, TypeScript, and Supabase.

## Features

- **Card Catalog Management**: Comprehensive catalog sync for Pokémon, Magic: The Gathering, and Pokémon Japan
- **Inventory Management**: Track intake items, trade-ins, and product data
- **Label Designer**: Custom label templates with drag-and-drop editing
- **Print Management**: Queue-based printing system with support for thermal printers
- **Shopify Integration**: Sync products and manage multiple store configurations
- **Admin Dashboard**: System monitoring, diagnostics, and user management

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite
- **Backend**: Supabase (PostgreSQL, Edge Functions, Auth)
- **UI Components**: Radix UI, shadcn/ui
- **State Management**: React Query (TanStack Query)
- **Routing**: React Router DOM

## Database Architecture

### Catalog System (`catalog_v2` schema)
- Always query `catalog_v2` with `supabase.schema('catalog_v2').from('<table>')`
- Relationship selects inside a schema drop the schema prefix (e.g., `set:sets(name)`)
- Admin "Database Overview" uses `catalog_v2_stats(game_in)` with values: `mtg`, `pokemon`, `pokemon-japan`

### Game Slug Mapping
- **MTG**: `mtg`
- **Pokémon Global**: `pokemon` 
- **Pokémon Japan**: `pokemon-japan`

## Development

### Prerequisites
- Node.js 18+
- Supabase CLI
- npm or pnpm

### Setup
```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies  
npm install

# Start development server
npm run dev

# Start Supabase locally (optional)
supabase start
```

### Smoke Tests
The following scripts help verify system functionality:

```bash
# Test catalog search endpoint (requires jq)
npm run smoke:search

# Test catalog stats (requires psql and SUPABASE_DB_URL)
npm run smoke:stats
```

### Environment Variables
Set up your environment variables for local development.

## Key Concepts

### Catalog Synchronization
The system syncs card data from external APIs (JustTCG, etc.) into the `catalog_v2` schema:
1. **Sets**: Basic set information (name, release date, total cards)
2. **Cards**: Individual card data (name, number, rarity, images)
3. **Variants**: Card variants with pricing and condition info

### Print System
- **Templates**: Custom label designs stored as Fabric.js JSON
- **Jobs**: Print requests queued per workstation
- **Rendering**: Server-side label rendering to TSPL commands

### Authentication & Authorization
- Role-based access control (admin, staff)
- Row-level security policies on all tables
- Secure API endpoints with proper authentication

## Deployment

Simply open [Lovable](https://lovable.dev/projects/27406049-6243-4487-9589-cdc440cd3aa0) and click on Share -> Publish.

The application auto-deploys edge functions. For production:

1. Configure Supabase project settings
2. Set up proper RLS policies  
3. Configure authentication providers
4. Set environment variables for integrations

## Security Notes

- All database operations use RLS policies
- Edge functions use SECURITY DEFINER for privileged operations
- API keys stored encrypted in `system_settings`
- Regular security linter checks recommended

## Technologies Used

This project is built with:
- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- Supabase

## Contributing

1. Follow existing code patterns and conventions
2. Ensure all new tables have proper RLS policies
3. Test edge functions thoroughly before deployment
4. Update this README for significant architectural changes

## Custom Domain

You can connect a custom domain by navigating to Project > Settings > Domains and clicking Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
