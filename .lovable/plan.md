

## Add Per-Region Service Toggle Settings

### Approach
Use the existing `region_settings` table and `RegionSettingsEditor` to add service toggles per region. No schema changes needed — just add new setting fields.

### Changes

**1. `src/components/admin/RegionSettingsEditor.tsx`** — Add new "Services" category fields to `SETTING_FIELDS`:
```ts
// Services
{ key: 'services.ebay_sync', label: 'eBay Sync', type: 'boolean', category: 'services', description: 'Enable eBay inventory sync for this store' },
{ key: 'services.shopify_sync', label: 'Shopify Sync', type: 'boolean', category: 'services', description: 'Enable Shopify inventory sync for this store' },
{ key: 'services.discord_notifications', label: 'Discord Notifications', type: 'boolean', category: 'services', description: 'Enable Discord order notifications' },
```

Add a "Services" accordion section in the UI (alongside Branding, eBay, Operations, Discord) with a plug/connection icon.

Update the `SettingField` category type to include `'services'`.

**2. `src/hooks/useRegionSettings.ts`** — Add the new service keys to the `RegionSettings` interface:
```ts
'services.ebay_sync': boolean;
'services.shopify_sync': boolean;
'services.discord_notifications': boolean;
```

**3. Gate eBay sync** — In the eBay sync components (e.g., `EbaySyncControls`, `EbayApp`), check the region setting `services.ebay_sync` before allowing sync operations. If disabled, show a message like "eBay sync is disabled for this store."

This leverages the existing key-value region_settings infrastructure with no database changes required. You can add more service toggles later (e.g., `services.intake_enabled`) the same way.

