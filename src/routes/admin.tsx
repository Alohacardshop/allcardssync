import React from 'react';
import { Route, Navigate } from 'react-router-dom';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { CatalogMigrationPlaceholder } from '@/components/CatalogMigrationPlaceholder';
import { PATHS } from './paths';

const Admin = React.lazy(() => import('@/pages/Admin'));
const DiscordNotifications = React.lazy(() => import('@/pages/admin/DiscordNotifications'));
const PendingNotifications = React.lazy(() => import('@/pages/PendingNotifications'));
const ShopifyBackfill = React.lazy(() => import('@/pages/admin/ShopifyBackfill'));
const InventorySyncDashboard = React.lazy(() => import('@/pages/admin/InventorySyncDashboard'));
const SyncHealthPage = React.lazy(() => import('@/pages/admin/SyncHealthPage'));

/**
 * Admin routes - uses AdminLayout (no AppShell, has own sidebar)
 */
export const adminRoutes = (
  <Route path={PATHS.admin} element={<AdminLayout />}>
    <Route index element={<Admin />} />
    <Route path="catalog" element={<div className="p-8"><CatalogMigrationPlaceholder /></div>} />
    <Route path="notifications/discord" element={<DiscordNotifications />} />
    <Route path="notifications/pending" element={<PendingNotifications />} />
    <Route path="shopify-backfill" element={<ShopifyBackfill />} />
    <Route path="inventory-sync" element={<InventorySyncDashboard />} />
    <Route path="sync-health" element={<SyncHealthPage />} />
    <Route path="ebay-settings" element={<Navigate to={PATHS.ebay} replace />} />
  </Route>
);
