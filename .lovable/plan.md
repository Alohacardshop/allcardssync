

## Problem

Only `services.ebay_sync` rows exist in the database for both regions. When you click "Shopify Sync" or "Discord Notifications," the upsert tries to INSERT a new row. The code and RLS policies look correct (admin has ALL access, unique constraint exists for upsert), so the issue is likely **not** a permissions problem.

The real issue is that `services.shopify_sync` and `services.discord_notifications` rows simply don't exist yet. The upsert *should* create them, but the button click may be silently failing or the accordion is swallowing the click event before it reaches the button.

Looking at the code, I notice the `isSaving` variable depends on `savingKey === saveKey`. If a previous save attempt failed and `savingKey` got stuck (or if the error handler doesn't run), subsequent clicks would find the button `disabled={isSaving}` permanently.

## Plan

### 1. Seed the missing service toggle rows
Insert the missing `services.shopify_sync` and `services.discord_notifications` rows for both regions via a database migration. This ensures the upsert always hits an UPDATE (not INSERT), matching how `services.ebay_sync` already works.

```sql
INSERT INTO region_settings (region_id, setting_key, setting_value, description)
VALUES 
  ('hawaii', 'services.shopify_sync', 'false', 'Enable Shopify inventory sync'),
  ('hawaii', 'services.discord_notifications', 'false', 'Enable Discord order notifications'),
  ('las_vegas', 'services.shopify_sync', 'false', 'Enable Shopify inventory sync'),
  ('las_vegas', 'services.discord_notifications', 'false', 'Enable Discord order notifications')
ON CONFLICT (region_id, setting_key) DO NOTHING;
```

### 2. Add defensive error logging to the toggle click handler
Update the boolean toggle's `onClick` in `RegionSettingsEditor.tsx` to log the error details to the console. This ensures any future upsert failures are visible rather than silently swallowed.

This is a small, targeted fix -- seeding the rows is the primary solution.

