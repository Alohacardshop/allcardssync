# Catalog Migration Notice

## Overview

As of **August 29, 2025**, all catalog syncing functionality has been migrated from this repository to the dedicated external service:

**🏠 New Home:** [Alohacardshop/alohacardshopcarddatabase](https://github.com/Alohacardshop/alohacardshopcarddatabase)

## What Changed

### ❌ Removed from this repository:
- All `catalog_v2` database tables, functions, and triggers
- Supabase Edge Functions for catalog operations (`catalog-sync-*`, `catalog-reset`, etc.)
- Admin UI components for catalog management 
- Catalog browsing and search functionality
- All SQL migrations that created catalog infrastructure

### ✅ What remains:
- Inventory management system
- Label printing functionality  
- Shopify integration
- User authentication and roles
- All non-catalog features continue to work normally

## Migration Path

### For Developers

1. **Reading Catalog Data:**
   ```typescript
   // OLD (removed):
   const { data } = await supabase.rpc('catalog_v2_browse_cards', {...});
   
   // NEW (implement):
   const response = await fetch('https://external-tcg-api.com/cards', {
     headers: { 'Authorization': `Bearer ${API_KEY}` }
   });
   const data = await response.json();
   ```

2. **Catalog Operations:**
   - All catalog sync, reset, and management operations are now handled by the external service
   - Contact the TCG database service team for access and API documentation

### For System Administrators

1. **Database Cleanup:**
   - All `catalog_v2.*` tables have been removed from migrations
   - Fresh deployments will not create catalog infrastructure
   - Existing deployments may need manual cleanup if desired

2. **Environment Variables:**
   - Remove any `VITE_USE_CATALOG_V2_*` environment variables
   - These are no longer needed and have been cleaned up

3. **Cron Jobs:**
   - Any cron jobs calling catalog sync functions should be disabled
   - Check `supabase/migrations/*` for any remaining references

## External Service Integration

### API Endpoints
The new external TCG database service provides:
- Card search and browsing APIs
- Set management endpoints  
- Real-time pricing data
- Bulk import/export functionality

### Authentication
- Contact the external service team for API keys and documentation
- Integration examples will be provided in future updates

## UI Changes

### Admin Dashboard
- **Catalog tab:** Now shows migration notice with link to external service
- **Previous features:** Card browsing, set management, sync controls have been removed
- **Navigation:** All catalog-related menu items redirect to migration notice

### Inventory System
- **Card search:** Currently shows error message directing to external service
- **Future updates:** Will integrate with external API for seamless card lookup
- **Existing data:** All existing inventory data remains intact

## Timeline

- **✅ Phase 1 (Complete):** Remove local catalog infrastructure  
- **🔄 Phase 2 (In Progress):** Integrate external API for card search
- **📋 Phase 3 (Planned):** Full external service integration
- **🎯 Phase 4 (Future):** Enhanced features via external service

## Support

### For Issues:
1. **Non-catalog issues:** Continue using this repository's issue tracker
2. **Catalog-related needs:** Contact [Alohacardshop/alohacardshopcarddatabase](https://github.com/Alohacardshop/alohacardshopcarddatabase)

### For Questions:
- Check the external service documentation (coming soon)
- Reach out to the development team for integration guidance

---

*This migration improves system architecture by separating concerns and allows the catalog system to scale independently while this application focuses on inventory management and operations.*